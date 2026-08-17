import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Redis from "ioredis";

const rootEnv = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../.env");
config({ path: rootEnv });

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function main() {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });

  redis.on("error", (err) => {
    console.error("[worker] redis error", err.message);
  });

  await redis.ping();
  console.log("[worker] Phase 0 stub — Redis connected. No FFmpeg jobs yet.");
  console.log("[worker] Idle. Waiting for Phase 1 ingest queue.");

  setInterval(async () => {
    try {
      await redis.ping();
    } catch (err) {
      console.error("[worker] ping failed", err);
    }
  }, 30_000);
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
