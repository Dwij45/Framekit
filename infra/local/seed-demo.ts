import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "@framekit/db";

const rootEnv = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../.env");
config({ path: rootEnv });

async function main() {
  const email = "demo@framekit.dev";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("[local-infra] demo user already exists");
    return;
  }
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({
    data: { email, passwordHash, name: "Demo" },
  });
  console.log("[local-infra] created demo user", email);
}

main()
  .catch((err) => {
    console.error("[local-infra] seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
