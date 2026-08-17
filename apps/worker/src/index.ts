import "./load-env.js";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processIngestJob } from "./ingest.js";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function main() {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker(
    "ingest",
    async (job) => {
      const jobId = String(job.data.jobId ?? job.id);
      console.log("[worker] ingest start", jobId);
      await processIngestJob(jobId);
      console.log("[worker] ingest done", jobId);
    },
    {
      connection,
      concurrency: 1,
      // Encode + HLS can run for minutes; renew the BullMQ lock while FFmpeg is still going.
      lockDuration: 15 * 60 * 1000,
    },
  );

  worker.on("failed", (job, err) => {
    console.error("[worker] job failed", job?.id, err.message);
  });

  console.log("[worker] Phase 1B–1D — listening on queue ingest (probe + encode + HLS).");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
