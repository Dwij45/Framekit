import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { captionQueue } from "@/lib/queue";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { assetId } = await ctx.params;
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: actor.userId },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.status !== "ready") {
    return NextResponse.json({ error: "Asset is not ready." }, { status: 409 });
  }

  const running = await prisma.job.findFirst({
    where: { assetId, type: "caption", status: { in: ["queued", "encoding"] } },
  });
  if (running) {
    return NextResponse.json({ jobId: running.id, assetId, replayed: true });
  }

  const job = await prisma.job.create({
    data: {
      userId: actor.userId,
      assetId: asset.id,
      sourceAssetId: asset.id,
      type: "caption",
      status: "queued",
      progressStage: "queued",
      apiKeyId: actor.apiKeyId ?? undefined,
    },
  });
  await captionQueue.add("caption", { jobId: job.id });
  return NextResponse.json({ jobId: job.id, assetId: asset.id });
}
