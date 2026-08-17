import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { TimelinePlayground } from "@/components/timeline-playground";
import Link from "next/link";

export default async function RendersPage() {
  const session = await auth();
  const assets = session?.user?.id
    ? await prisma.asset.findMany({
        where: { userId: session.user.id, status: "ready" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, fileName: true },
      })
    : [];

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Studio</p>
        <h1>Timeline</h1>
        <p className="lede">
          Stitch pieces of videos you already encoded into one new file. You
          describe the cut in JSON — not an FFmpeg command. Need a single-file
          crop or mute instead? Open the video and use{" "}
          <strong>Make a new version</strong>.
        </p>
      </header>
      {assets.length === 0 ? (
        <p className="muted">
          Encode at least one clip on <Link href="/assets">Videos</Link> first.
        </p>
      ) : (
        <TimelinePlayground assets={assets} />
      )}
    </section>
  );
}
