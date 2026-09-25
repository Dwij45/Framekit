import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { Uploader } from "@/components/uploader";
import { VideoLibrary } from "@/components/video-library";
import { playbackFor } from "@/lib/playback";

export default async function AssetsPage() {
  const session = await auth();
  const assets = session?.user?.id
    ? await prisma.asset.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { renditions: { select: { kind: true, label: true } } },
      })
    : [];

  const items = assets.map((asset) => {
    const playback = playbackFor(asset.id, asset.renditions);
    const probe = asset.probeJson as
      | {
          format?: { duration?: string };
          streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
        }
      | null;
    const video = probe?.streams?.find((s) => s.codec_type === "video");
    const best = playback.mp4[0] ?? null;
    return {
      id: asset.id,
      fileName: asset.fileName,
      status: asset.status,
      durationSec: Number(probe?.format?.duration ?? 0),
      width: video?.width ?? null,
      height: video?.height ?? null,
      poster: playback.poster,
      downloadUrl: best?.url ?? null,
      downloadLabel: best?.label ?? null,
    };
  });

  return (
    <section className="page page-wide">
      <header className="page-head">
        <p className="eyebrow">Studio</p>
        <h1>Videos</h1>
        <p className="lede">
          Upload a clip with speed, crop, mute, logo, and caption look. Browse as{" "}
          <strong>Tiles</strong> or <strong>Details</strong>.
        </p>
      </header>
      <Uploader />
      {items.length === 0 ? (
        <p className="muted">Nothing here yet. Choose a video above.</p>
      ) : (
        <VideoLibrary items={items} />
      )}
    </section>
  );
}
