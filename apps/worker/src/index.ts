import "./load-env.js";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processIngestJob } from "./ingest.js";
import { processTransformJob } from "./transform.js";
import { processComposeJob } from "./compose.js";
import { processWebhookDelivery } from "./deliver-webhook.js";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function main() {
  const lockDuration = 15 * 60 * 1000;
  const ingestConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const transformConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const composeConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const webhookConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const ingest = new Worker(
    "ingest",
    async (job) => {
      const jobId = String(job.data.jobId ?? job.id);
      console.log("[worker] ingest start", jobId);
      await processIngestJob(jobId);
      console.log("[worker] ingest done", jobId);
    },
    { connection: ingestConn, concurrency: 1, lockDuration },
  );

  const transform = new Worker(
    "transform",
    async (job) => {
      const jobId = String(job.data.jobId ?? job.id);
      console.log("[worker] transform start", jobId);
      await processTransformJob(jobId);
      console.log("[worker] transform done", jobId);
    },
    { connection: transformConn, concurrency: 1, lockDuration },
  );

  const compose = new Worker(
    "compose",
    async (job) => {
      const jobId = String(job.data.jobId ?? job.id);
      console.log("[worker] compose start", jobId);
      await processComposeJob(jobId);
      console.log("[worker] compose done", jobId);
    },
    { connection: composeConn, concurrency: 1, lockDuration },
  );

  const webhook = new Worker(
    "webhook",
    async (job) => {
      const deliveryId = String(job.data.deliveryId ?? job.id);
      console.log("[worker] webhook start", deliveryId);
      await processWebhookDelivery(deliveryId);
      console.log("[worker] webhook done", deliveryId);
    },
    { connection: webhookConn, concurrency: 2, lockDuration: 60_000 },
  );

  ingest.on("failed", (job, err) => {
    console.error("[worker] ingest failed", job?.id, err.message);
  });
  transform.on("failed", (job, err) => {
    console.error("[worker] transform failed", job?.id, err.message);
  });
  compose.on("failed", (job, err) => {
    console.error("[worker] compose failed", job?.id, err.message);
  });
  webhook.on("failed", (job, err) => {
    console.error("[worker] webhook failed", job?.id, err.message);
  });

  console.log("[worker] listening on queues ingest + transform + compose + webhook");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
