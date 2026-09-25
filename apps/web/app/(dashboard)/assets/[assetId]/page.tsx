import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { CaptionButton } from "@/components/caption-button";
import { CaptionLookPanel } from "@/components/caption-look-panel";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { TransformForm } from "@/components/transform-form";
import { playbackFor } from "@/lib/playback";
import { jobTypeLabel, videoTitle } from "@/lib/labels";

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
  const named = videoTitle(asset.fileName);
  const hasCaptions = playback.captions.length > 0;

  return (
    <section className="page">
      <p className="crumb">
        <Link href="/assets">Videos</Link>
      </p>
      <header className="page-head">
        <p className="eyebrow">Video</p>
        <h1>{named.title}</h1>
        <p className="lede inline-status">
          <StatusPill status={asset.status} />
          {named.kind ? <span className="video-kind">{named.kind}</span> : null}
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
      {playback.hls ? (
        <CaptionLookPanel
          assetId={asset.id}
          src={playback.hls}
          poster={playback.poster}
          spriteVtt={playback.spriteVtt}
          captions={playback.captions}
          captionStyleUrl={playback.captionStyle}
          hasCaptions={hasCaptions}
        />
      ) : null}
      <div className="video-actions video-actions-detail">
        {playback.mp4.map((r) => (
          <a key={r.label} className="btn-ghost" href={`${r.url}?download=1`}>
            Download {r.label}
          </a>
        ))}
        <DeleteAssetButton assetId={asset.id} redirectTo="/assets" />
      </div>
      {asset.status === "ready" ? (
        <>
          <div className="panel">
            <h2 className="subhead">Captions</h2>
            <p className="muted">
              {hasCaptions
                ? "English track is on this file. Use CC on the player, or regenerate."
                : "No speech track yet. Generate after encode (needs audio)."}
            </p>
            <CaptionButton assetId={asset.id} hasCaptions={hasCaptions} />
          </div>
          <TransformForm assetId={asset.id} />
        </>
      ) : null}
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
                  Edit → {videoTitle(job.asset.fileName).title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
