import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { usageCapMs, usageMonthKey } from "@framekit/shared";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const yyyymm = usageMonthKey();
  const row = await prisma.usageMonth.findUnique({
    where: { userId_yyyymm: { userId: actor.userId, yyyymm } },
  });
  const encodedMs = row?.encodedMs ?? 0;
  const capMs = usageCapMs();
  return NextResponse.json({
    yyyymm,
    encodedMs,
    encodedMinutes: Math.round((encodedMs / 60000) * 100) / 100,
    capMinutes: capMs > 0 ? capMs / 60000 : null,
  });
}
