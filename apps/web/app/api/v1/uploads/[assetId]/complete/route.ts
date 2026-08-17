import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { headObject } from "@framekit/storage";
import { ingestQueue } from "@/lib/queue";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.status !== "uploading") {
    return NextResponse.json({ error: "Upload already completed." }, { status: 409 });
  }

  try {
    const head = await headObject(asset.originalKey);
    const stored = head.ContentLength ?? 0;
    if (asset.byteSize && stored > 0 && stored !== asset.byteSize) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { byteSize: stored },
      });
    }
  } catch {
    return NextResponse.json(
      { error: "File not found in storage. Finish the upload first." },
      { status: 400 },
    );
  }

  const job = await prisma.job.create({
    data: {
      userId,
      assetId: asset.id,
      type: "ingest_transcode",
      status: "queued",
      progressStage: "queued",
    },
  });

  await ingestQueue.add("ingest", { jobId: job.id });

  return NextResponse.json({ jobId: job.id, assetId: asset.id });
}
