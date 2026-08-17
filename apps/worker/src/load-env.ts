import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootEnv = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../.env");
config({ path: rootEnv });
