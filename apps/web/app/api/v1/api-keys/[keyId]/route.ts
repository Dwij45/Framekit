import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ keyId: string }> },
) {
  const actor = await requireAuth(req);
  if (!actor || actor.apiKeyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { keyId } = await ctx.params;
  const row = await prisma.apiKey.findFirst({
    where: { id: keyId, userId: actor.userId },
  });
  if (!row) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  await prisma.apiKey.update({
    where: { id: row.id },
    data: { revokedAt: row.revokedAt ?? new Date() },
  });
  return NextResponse.json({ ok: true });
}
