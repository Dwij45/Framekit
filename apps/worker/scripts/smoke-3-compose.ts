import "../src/load-env.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@framekit/db";
import { parseTimeline } from "@framekit/shared";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function main() {
  const source = await prisma.asset.findFirst({
    where: { status: "ready", renditions: { some: { kind: "mp4" } } },
    orderBy: { createdAt: "desc" },
  });
  if (!source) {
    throw new Error("No ready asset with an MP4 — run smoke-1bcd.ts first.");
  }

  const timeline = parseTimeline({
    clips: [
        { assetId: source.id, trimStart: 0, trimEnd: 1 },
        { assetId: source.id, trimStart: 1, trimEnd: 2 },
    ],
    overlay: { x: 24, y: 24 },
    mute: true,
  });

  const output = await prisma.asset.create({
    data: {
      userId: source.userId,
      status: "uploading",
      originalKey: "pending",
      fileName: `${source.fileName} (compose · 2 clips)`,
      contentType: "video/mp4",
    },
  });

  const job = await prisma.job.create({
    data: {
      userId: source.userId,
      assetId: output.id,
      sourceAssetId: source.id,
      type: "compose",
      status: "queued",
      progressStage: "queued",
      specJson: timeline,
    },
  });

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("compose", { connection });
  await queue.add("compose", { jobId: job.id });
  await queue.close();
  await connection.quit();

  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    const row = await prisma.job.findUnique({
      where: { id: job.id },
      include: { asset: { include: { renditions: true } } },
    });
    if (!row) throw new Error("job disappeared");
    console.log(`[smoke-3] ${row.status} ${row.progressPct}% ${row.progressStage ?? ""}`);
    if (row.status === "ready") {
      const kinds = row.asset.renditions.map((r) => `${r.kind}:${r.label}`).sort();
      console.log("[smoke-3] renditions", kinds.join(", "));
      if (!kinds.includes("hls_master:master")) throw new Error("missing HLS");
      console.log("[smoke-3] OK", output.id);
      return;
    }
    if (row.status === "failed") {
      throw new Error(`${row.errorCode}: ${row.errorMessage}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("timed out");
}

main()
  .catch((err) => {
    console.error("[smoke-3] FAIL", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
