import { Queue } from "bullmq";
import IORedis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const connection = new IORedis(url, { maxRetriesPerRequest: null });

export const ingestQueue = new Queue("ingest", { connection });
export const transformQueue = new Queue("transform", { connection });
export const composeQueue = new Queue("compose", { connection });
export const captionQueue = new Queue("caption", { connection });
