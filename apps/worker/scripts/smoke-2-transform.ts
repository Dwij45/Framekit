import "../src/load-env.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@framekit/db";
import { parseTransformSpec } from "@framekit/shared";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function main() {
  const source = await prisma.asset.findFirst({
    where: { status: "ready", renditions: { some: { kind: "mp4" } } },
    orderBy: { createdAt: "desc" },
  });
  if (!source) {
    throw new Error("No ready asset with an MP4 — run smoke-1bcd.ts first.");
  }

  const spec = parseTransformSpec({
    quality: "default",
    aspect: "9:16",
    mute: true,
    watermark: { x: 24, y: 24 },
    speed: 1,
  });

  const output = await prisma.asset.create({
    data: {
      userId: source.userId,
      status: "uploading",
      originalKey: "pending",
      fileName: `${source.fileName} (9:16 · mute · logo)`,
      contentType: "video/mp4",
    },
  });

  const job = await prisma.job.create({
    data: {
      userId: source.userId,
      assetId: output.id,
      sourceAssetId: source.id,
      type: "transform",
      status: "queued",
      progressStage: "queued",
      specJson: spec,
    },
  });

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("transform", { connection });
  await queue.add("transform", { jobId: job.id });
  await queue.close();
  await connection.quit();

  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    const row = await prisma.job.findUnique({
      where: { id: job.id },
      include: { asset: { include: { renditions: true } } },
    });
    if (!row) throw new Error("job disappeared");
    console.log(`[smoke-2] ${row.status} ${row.progressPct}% ${row.progressStage ?? ""}`);
    if (row.status === "ready") {
      const kinds = row.asset.renditions.map((r) => `${r.kind}:${r.label}`).sort();
      console.log("[smoke-2] renditions", kinds.join(", "));
      if (!kinds.includes("hls_master:master")) throw new Error("missing HLS");
      console.log("[smoke-2] OK", output.id);
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
    console.error("[smoke-2] FAIL", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
