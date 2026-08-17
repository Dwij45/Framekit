import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { ingestQueue, transformQueue } from "@/lib/queue";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
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
    include: { asset: { include: { renditions: { select: { id: true } } } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const noRenditions = job.asset.renditions.length === 0;
  const canRetry = job.status === "failed" || (job.status === "ready" && noRenditions);
  if (!canRetry) {
    return NextResponse.json(
      { error: "Only failed jobs (or 1A probe-only ready jobs) can be retried." },
      { status: 409 },
    );
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "queued",
      progressPct: 0,
      progressStage: "queued",
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    },
  });
  await prisma.asset.update({
    where: { id: job.assetId },
    data: { status: "uploading", errorMessage: null },
  });

  if (job.type === "transform") {
    await transformQueue.add("transform", { jobId: job.id });
  } else {
    await ingestQueue.add("ingest", { jobId: job.id });
  }

  return NextResponse.json({ ok: true, jobId: job.id });
}
