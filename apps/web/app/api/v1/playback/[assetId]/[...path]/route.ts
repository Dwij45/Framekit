import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { getObject } from "@framekit/storage";
import { mimeForPlayback, safePlaybackRel } from "@/lib/playback";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function toClientStream(
  body: { transformToWebStream: () => ReadableStream<Uint8Array> },
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const source = body.transformToWebStream();
  if (signal.aborted) {
    void source.cancel().catch(() => undefined);
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }
  const onAbort = () => {
    void source.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        try {
          controller.enqueue(chunk);
        } catch {
          onAbort();
        }
      },
      flush() {
        signal.removeEventListener("abort", onAbort);
      },
    }),
  );
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

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
    const obj = await getObject(key, range, req.signal);
    if (!obj.Body) {
      return NextResponse.json({ error: "Empty object" }, { status: 404 });
    }

    const headers = new Headers(corsHeaders(req));
    headers.set("Content-Type", mimeForPlayback(rel, obj.ContentType));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=60");
    if (obj.ContentLength != null) {
      headers.set("Content-Length", String(obj.ContentLength));
    }
    if (obj.ContentRange) {
      headers.set("Content-Range", obj.ContentRange);
    }

    return new NextResponse(toClientStream(obj.Body, req.signal), {
      status: range && obj.ContentRange ? 206 : 200,
      headers,
    });
  } catch (err) {
    if (req.signal.aborted) {
      return new NextResponse(null, { status: 204 });
    }
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ error: "Object not found" }, { status: 404 });
  }
}
