import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import Redis from "ioredis";

export const runtime = "nodejs";

async function checkPostgres(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

async function checkRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG";
  } finally {
    redis.disconnect();
  }
}

async function checkStorage(): Promise<boolean> {
  const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000";
  const res = await fetch(`${endpoint}/minio/health/live`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });
  return res.ok;
}

export async function GET() {
  const [db, redis, storage] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
    checkStorage(),
  ]);

  const body = {
    ok: false,
    db: db.status === "fulfilled" && db.value,
    redis: redis.status === "fulfilled" && redis.value,
    storage: storage.status === "fulfilled" && storage.value,
  };
  body.ok = body.db && body.redis && body.storage;

  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
