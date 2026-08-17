import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { getObject } from "@framekit/storage";
import { mimeForPlayback, safePlaybackRel } from "@/lib/playback";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ assetId: string; path: string[] }> },
) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId, path: parts } = await ctx.params;
  const rel = safePlaybackRel(parts);
  if (!rel) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: actor.userId },
    select: { id: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const key = `assets/${assetId}/${rel}`;
  const range = req.headers.get("range") ?? undefined;

  try {
    const obj = await getObject(key, range);
    if (!obj.Body) {
      return NextResponse.json({ error: "Empty object" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", mimeForPlayback(rel, obj.ContentType));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=60");
    if (obj.ContentLength != null) {
      headers.set("Content-Length", String(obj.ContentLength));
    }
    if (obj.ContentRange) {
      headers.set("Content-Range", obj.ContentRange);
    }

    return new NextResponse(obj.Body.transformToWebStream(), {
      status: range && obj.ContentRange ? 206 : 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Object not found" }, { status: 404 });
  }
}
