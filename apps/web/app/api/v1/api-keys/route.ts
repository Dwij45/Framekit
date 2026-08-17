import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { hashApiKey, mintApiKey } from "@framekit/shared";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (!actor || actor.apiKeyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const keys = await prisma.apiKey.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (!actor || actor.apiKeyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name = "default";
  try {
    const body = (await req.json()) as { name?: string };
    name = String(body.name ?? "default").trim().slice(0, 80) || "default";
  } catch {
    name = "default";
  }

  const active = await prisma.apiKey.count({
    where: { userId: actor.userId, revokedAt: null },
  });
  if (active >= 5) {
    return NextResponse.json({ error: "At most 5 active API keys." }, { status: 409 });
  }

  const live = process.env.FRAMEKIT_LIVE === "1";
  const minted = mintApiKey(live);
  const secretHash = await hashApiKey(minted.plaintext);
  const row = await prisma.apiKey.create({
    data: {
      userId: actor.userId,
      name,
      prefix: minted.prefix,
      secretHash,
    },
  });

  return NextResponse.json({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    key: minted.plaintext,
    createdAt: row.createdAt,
  });
}
