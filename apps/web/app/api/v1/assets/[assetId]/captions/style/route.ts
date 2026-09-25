import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { parseCaptionStyle } from "@framekit/shared";
import { uploadBytes } from "@framekit/storage";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function PUT(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let style;
  try {
    style = parseCaptionStyle(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid caption style";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const key = `assets/${assetId}/captions/style.json`;
  const size = await uploadBytes(key, JSON.stringify(style), "application/json");
  await prisma.rendition.deleteMany({
    where: { assetId, kind: "caption_style" },
  });
  await prisma.rendition.create({
    data: {
      assetId,
      kind: "caption_style",
      label: "style",
      storageKey: key,
      mime: "application/json",
      byteSize: size,
    },
  });

  return NextResponse.json({ ok: true, style });
}
