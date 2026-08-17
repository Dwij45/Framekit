import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { playbackFor } from "@/lib/playback";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

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
