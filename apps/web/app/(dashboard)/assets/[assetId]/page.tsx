import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HlsPlayer } from "@/components/hls-player";
import { StatusPill } from "@/components/status-pill";
import { TransformForm } from "@/components/transform-form";
import { playbackFor } from "@/lib/playback";
import { jobTypeLabel } from "@/lib/labels";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const session = await auth();
  const { assetId } = await params;
  if (!session?.user?.id) notFound();

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: session.user.id },
    include: {
      jobs: { orderBy: { createdAt: "desc" } },
      sourcedJobs: { orderBy: { createdAt: "desc" }, include: { asset: true } },
      renditions: true,
    },
  });
  if (!asset) notFound();

  const probe = asset.probeJson as
    | {
        format?: { duration?: string };
        streams?: Array<{ codec_type?: string; width?: number; height?: number; codec_name?: string }>;
      }
    | null;
  const video = probe?.streams?.find((s) => s.codec_type === "video");
  const playback = playbackFor(asset.id, asset.renditions);
  const duration = Number(probe?.format?.duration ?? 0);

  return (
    <section className="page">
      <p className="crumb">
        <Link href="/assets">Videos</Link>
      </p>
      <header className="page-head">
        <p className="eyebrow">Video</p>
        <h1>{asset.fileName}</h1>
        <p className="lede inline-status">
          <StatusPill status={asset.status} />
          {video ? (
            <span>
              {duration.toFixed(1)}s · {video.width}×{video.height}
            </span>
          ) : (
            <span>Waiting for the worker to inspect this file.</span>
          )}
        </p>
      </header>
      {asset.errorMessage ? <p className="form-error">{asset.errorMessage}</p> : null}
      {playback.hls ? <HlsPlayer src={playback.hls} poster={playback.poster} /> : null}
      {playback.mp4.length > 0 ? (
        <p className="muted downloads">
          Download{" "}
          {playback.mp4.map((r) => (
            <a key={r.label} href={r.url}>
              {r.label}
            </a>
          ))}
        </p>
      ) : null}
      {asset.status === "ready" ? <TransformForm assetId={asset.id} /> : null}
      {asset.jobs.length + asset.sourcedJobs.length > 0 ? (
        <>
          <h2 className="subhead">Related jobs</h2>
          <ul className="plain-list">
            {asset.jobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`}>
                  {jobTypeLabel(job.type)} · {job.status}
                </Link>
              </li>
            ))}
            {asset.sourcedJobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`}>
                  Edit → {job.asset.fileName}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
