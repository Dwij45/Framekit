import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { parseWebhookUrl } from "@framekit/shared";
import { assertSafeWebhookUrl, webhookSafetyOpts } from "@framekit/shared/webhooks";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, createdAt: true, disabledAt: true },
  });
  return NextResponse.json({ endpoints });
}

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = String(body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    parseWebhookUrl(url, webhookSafetyOpts());
    await assertSafeWebhookUrl(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const active = await prisma.webhookEndpoint.count({
    where: { userId: actor.userId, disabledAt: null },
  });
  if (active >= 5) {
    return NextResponse.json({ error: "At most 5 webhook endpoints." }, { status: 409 });
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const row = await prisma.webhookEndpoint.create({
    data: { userId: actor.userId, url, secret },
  });

  return NextResponse.json({
    id: row.id,
    url: row.url,
    secret,
    createdAt: row.createdAt,
  });
}
