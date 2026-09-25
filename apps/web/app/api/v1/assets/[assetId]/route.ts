import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { deleteObjectKey, deletePrefix } from "@framekit/storage";
import { playbackFor } from "@/lib/playback";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

const BUSY = ["queued", "probing", "encoding", "packaging"];

export async function GET(
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
    include: { renditions: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: asset.id,
    fileName: asset.fileName,
    status: asset.status,
    contentType: asset.contentType,
    probe: asset.probeJson,
    playback: playbackFor(asset.id, asset.renditions),
    renditions: asset.renditions.map((r) => ({
      kind: r.kind,
      label: r.label,
      mime: r.mime,
    })),
  });
}

export async function DELETE(
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
    include: { jobs: { select: { status: true } } },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.jobs.some((job) => BUSY.includes(job.status))) {
    return NextResponse.json(
      { error: "Wait until encoding finishes, then you can remove it." },
      { status: 409 },
    );
  }

  await deletePrefix(`assets/${assetId}/`);
  await deleteObjectKey(asset.originalKey);
  await prisma.asset.delete({ where: { id: assetId } });
  return NextResponse.json({ ok: true });
}
