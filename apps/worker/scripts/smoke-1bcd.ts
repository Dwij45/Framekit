import "../src/load-env.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@framekit/db";
import { uploadFile } from "@framekit/storage";
import { ffmpegBin, ffmpegPath, runCommand } from "../src/ffmpeg.js";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function waitForJob(jobId: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { asset: { include: { renditions: true } } },
    });
    if (!job) throw new Error(`Job ${jobId} disappeared`);
    console.log(
      `[smoke] ${job.status} ${job.progressPct}% ${job.progressStage ?? ""}`,
    );
    if (job.status === "ready" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function enqueue(userId: string, fileName: string, filePath: string, contentType: string) {
  const asset = await prisma.asset.create({
    data: {
      userId,
      status: "uploading",
      originalKey: "pending",
      fileName,
      contentType,
    },
  });
  const originalKey = `uploads/${userId}/${asset.id}/${fileName}`;
  await prisma.asset.update({
    where: { id: asset.id },
    data: { originalKey },
  });
  await uploadFile(originalKey, filePath, contentType);
  const job = await prisma.job.create({
    data: {
      userId,
      assetId: asset.id,
      type: "ingest_transcode",
      status: "queued",
      progressStage: "queued",
    },
  });
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("ingest", { connection });
  await queue.add("ingest", { jobId: job.id });
  await queue.close();
  await connection.quit();
  return job.id;
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user in Postgres — register once in the dashboard first.");

  const dir = await mkdtemp(path.join(tmpdir(), "framekit-smoke-"));
  const clip = path.join(dir, "test-3s.mp4");
  const fake = path.join(dir, "fake.mp4");

  try {
    console.log("[smoke] generating 1280x720 3s clip with", ffmpegBin());
    await runCommand(ffmpegBin(), [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=1280x720:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-t",
      "3",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      ffmpegPath(clip),
    ]);
    await writeFile(fake, "this is not a video\n");

    const goodId = await enqueue(user.id, "test-3s.mp4", clip, "video/mp4");
    console.log("[smoke] queued good job", goodId);
    const good = await waitForJob(goodId, 5 * 60 * 1000);
    if (good.status !== "ready") {
      throw new Error(`Expected ready, got ${good.status}: ${good.errorCode} ${good.errorMessage}`);
    }
    const kinds = good.asset.renditions.map((r) => `${r.kind}:${r.label}`).sort();
    console.log("[smoke] renditions", kinds.join(", "));
    if (!kinds.some((k) => k.startsWith("mp4:"))) throw new Error("Missing mp4 rendition");
    if (!kinds.includes("hls_master:master")) throw new Error("Missing HLS master");
    if (!kinds.includes("poster:poster")) throw new Error("Missing poster");

    const badId = await enqueue(user.id, "fake.mp4", fake, "video/mp4");
    console.log("[smoke] queued fake job", badId);
    const bad = await waitForJob(badId, 2 * 60 * 1000);
    if (bad.status !== "failed") {
      throw new Error(`Expected failed, got ${bad.status}`);
    }
    console.log("[smoke] fake failed as", bad.errorCode);
    console.log("[smoke] OK");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[smoke] FAIL", err);
  process.exit(1);
});
