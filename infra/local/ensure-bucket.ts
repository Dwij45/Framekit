import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureBucket } from "@framekit/storage";

const rootEnv = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../.env");
config({ path: rootEnv });

async function main() {
  await ensureBucket();
  console.log("[local-infra] MinIO bucket ready:", process.env.S3_BUCKET);
}

main().catch((err) => {
  console.error("[local-infra] bucket failed", err);
  process.exit(1);
});
