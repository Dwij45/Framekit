import { createHash } from "node:crypto";
import { prisma } from "@framekit/db";
import {
  parseApiKeyToken,
  usageCapMs,
  usageMonthKey,
  verifyApiKeyHash,
} from "@framekit/shared";
import { auth } from "@/auth";

export type Actor = {
  userId: string;
  apiKeyId: string | null;
};

export async function requireAuth(req: Request): Promise<Actor | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token.startsWith("fk_test_") || token.startsWith("fk_live_")) {
      return verifyBearerKey(token);
    }
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { userId, apiKeyId: null };
}

async function verifyBearerKey(token: string): Promise<Actor | null> {
  const parsed = parseApiKeyToken(token);
  if (!parsed) return null;
  const row = await prisma.apiKey.findUnique({
    where: { prefix: parsed.prefix },
  });
  if (!row || row.revokedAt) return null;
  const ok = await verifyApiKeyHash(token, row.secretHash);
  if (!ok) return null;
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return { userId: row.userId, apiKeyId: row.id };
}

export function idempotencyKeyFrom(req: Request): string | null {
  const raw = req.headers.get("idempotency-key")?.trim() ?? "";
  if (!raw) return null;
  if (!/^[\w.-]{1,128}$/.test(raw)) {
    throw new Error("Idempotency-Key must be 1–128 letters, digits, _ . or -.");
  }
  return raw;
}

export function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function readJsonWithIdempotency(req: Request): Promise<{
  body: unknown;
  raw: string;
  idempotencyKey: string | null;
  bodyHash: string;
}> {
  const raw = await req.text();
  const idempotencyKey = idempotencyKeyFrom(req);
  const bodyHash = hashBody(raw);
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("Invalid JSON");
    }
  }
  return { body, raw, idempotencyKey, bodyHash };
}

export async function findIdempotentJob(userId: string, key: string, bodyHash: string) {
  const existing = await prisma.job.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
  });
  if (!existing) return { kind: "missing" as const };
  if (existing.idempotencyHash !== bodyHash) return { kind: "conflict" as const };
  return { kind: "replay" as const, job: existing };
}

export async function assertUnderUsageCap(userId: string): Promise<string | null> {
  const cap = usageCapMs();
  if (cap <= 0) return null;
  const row = await prisma.usageMonth.findUnique({
    where: { userId_yyyymm: { userId, yyyymm: usageMonthKey() } },
  });
  if (row && row.encodedMs >= cap) {
    return "Monthly encoded-minute cap reached.";
  }
  return null;
}
