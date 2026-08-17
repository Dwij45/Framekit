import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { playbackFor } from "@/lib/playback";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: {
      asset: { include: { renditions: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const playback = playbackFor(job.assetId, job.asset.renditions);
  const canRetry =
    job.status === "failed" || (job.status === "ready" && job.asset.renditions.length === 0);

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progressPct: job.progressPct,
    progressStage: job.progressStage,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    assetId: job.assetId,
    probe: job.asset.probeJson,
    playback,
    canRetry,
  });
}
