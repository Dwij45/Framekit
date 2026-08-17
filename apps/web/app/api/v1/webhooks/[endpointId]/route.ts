import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ endpointId: string }> },
) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { endpointId } = await ctx.params;
  const row = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, userId: actor.userId },
  });
  if (!row) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }
  await prisma.webhookEndpoint.update({
    where: { id: row.id },
    data: { disabledAt: row.disabledAt ?? new Date() },
  });
  return NextResponse.json({ ok: true });
}
