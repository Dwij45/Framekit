import "../src/load-env.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@framekit/db";
import { downloadObjectToFile } from "@framekit/storage";
import { enqueueCaptionJob } from "../src/captions.js";
import { publishSpriteSheet } from "../src/sprites.js";

async function main() {
  const source = await prisma.asset.findFirst({
    where: { status: "ready", renditions: { some: { kind: "mp4" } } },
    include: { renditions: true },
    orderBy: { createdAt: "desc" },
  });
  if (!source) throw new Error("No ready asset with an MP4.");

  const mp4 = [...source.renditions]
    .filter((r) => r.kind === "mp4")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  const dir = await mkdtemp(path.join(tmpdir(), "framekit-smoke5-"));
  const dest = path.join(dir, "in.mp4");

  try {
    await downloadObjectToFile(mp4.storageKey, dest);
    const duration = Number(
      (source.probeJson as { format?: { duration?: string } } | null)?.format?.duration ?? 5,
    );
    await publishSpriteSheet({
      assetId: source.id,
      input: dest,
      durationSec: duration,
      workDir: dir,
    });
    const kinds = (
      await prisma.rendition.findMany({
        where: { assetId: source.id },
        select: { kind: true, label: true },
      })
    )
      .map((r) => `${r.kind}:${r.label}`)
      .sort();
    console.log("[smoke-5] renditions", kinds.join(", "));
    if (!kinds.includes("sprite:sprite") || !kinds.includes("sprite_vtt:sprite")) {
      throw new Error("missing sprite renditions");
    }
    console.log("[smoke-5] sprite OK", source.id);

    const talking = await prisma.asset.findFirst({
      where: {
        status: "ready",
        renditions: { some: { kind: "mp4" } },
      },
      orderBy: { createdAt: "desc" },
    }).then(async (latest) => {
      const rows = await prisma.asset.findMany({
        where: { status: "ready", renditions: { some: { kind: "mp4" } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return (
        rows.find((row) =>
          (row.probeJson as { streams?: Array<{ codec_type?: string }> } | null)?.streams?.some(
            (s) => s.codec_type === "audio",
          ),
        ) ?? latest
      );
    });
    const hasAudio = Boolean(
      talking &&
        (talking.probeJson as { streams?: Array<{ codec_type?: string }> } | null)?.streams?.some(
          (s) => s.codec_type === "audio",
        ),
    );
    if (!talking || !hasAudio) {
      console.log("[smoke-5] no audio on ready assets — skip captions");
      return;
    }

    const jobId = await enqueueCaptionJob(talking.userId, talking.id);
    console.log("[smoke-5] caption job", jobId);
    const started = Date.now();
    while (Date.now() - started < 12 * 60 * 1000) {
      const row = await prisma.job.findUnique({ where: { id: jobId } });
      console.log(`[smoke-5] ${row?.status} ${row?.progressPct}% ${row?.progressStage ?? ""}`);
      if (row?.status === "ready") {
        const caps = await prisma.rendition.findMany({
          where: { assetId: talking.id, kind: "captions" },
        });
        if (caps.length === 0) throw new Error("missing captions rendition");
        console.log("[smoke-5] captions OK");
        return;
      }
      if (row?.status === "failed") {
        throw new Error(`${row.errorCode}: ${row.errorMessage}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("caption timed out");
  } finally {
    await Promise.race([
      rm(dir, { recursive: true, force: true }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[smoke-5] FAIL", err);
    await prisma.$disconnect();
    process.exit(1);
  });
