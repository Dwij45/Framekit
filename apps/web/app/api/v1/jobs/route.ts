import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { asset: { select: { fileName: true } } },
  });

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progressPct: job.progressPct,
      progressStage: job.progressStage,
      assetId: job.assetId,
      fileName: job.asset.fileName,
      createdAt: job.createdAt,
    })),
  });
}
