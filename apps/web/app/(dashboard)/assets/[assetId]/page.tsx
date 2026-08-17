import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HlsPlayer } from "@/components/hls-player";
import { TransformForm } from "@/components/transform-form";
import { playbackFor } from "@/lib/playback";

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

  return (
    <section>
      <p className="muted">
        <Link href="/assets">Assets</Link>
      </p>
      <h1>{asset.fileName}</h1>
      <p className="lede">
        Status <strong>{asset.status}</strong>. Original object{" "}
        <code>{asset.originalKey}</code>
      </p>
      {asset.errorMessage ? <p className="form-error">{asset.errorMessage}</p> : null}
      {playback.hls ? <HlsPlayer src={playback.hls} poster={playback.poster} /> : null}
      {video ? (
        <ul className="checklist">
          <li>Duration: {Number(probe?.format?.duration ?? 0).toFixed(2)}s</li>
          <li>
            {video.width}×{video.height} {video.codec_name}
          </li>
          {playback.mp4.map((r) => (
            <li key={r.label}>
              <a href={r.url}>{r.label} MP4</a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No probe data yet (job still running or failed).</p>
      )}
      {asset.status === "ready" ? <TransformForm assetId={asset.id} /> : null}
      <h2 className="subhead">Jobs</h2>
      <ul className="checklist">
        {asset.jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`}>
              {job.type} — {job.status} — {job.progressStage ?? "—"} ({job.progressPct}%)
            </Link>
          </li>
        ))}
        {asset.sourcedJobs.map((job) => (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`}>
              transform of this file → {job.asset.fileName} ({job.status})
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
