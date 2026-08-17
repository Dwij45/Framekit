import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { presignPut } from "@framekit/storage";
import { ALLOWED_UPLOAD_TYPES, maxUploadBytes, safeFileName } from "@framekit/shared";
import { requireAuth } from "@/lib/auth-request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json(
      { error: "Session is stale. Sign out and sign in again." },
      { status: 401 },
    );
  }

  let body: { fileName?: string; contentType?: string; byteSize?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fileName = safeFileName(String(body.fileName ?? ""));
  const contentType = String(body.contentType ?? "");
  const byteSize = Number(body.byteSize ?? 0);

  if (!ALLOWED_UPLOAD_TYPES.includes(contentType as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
    return NextResponse.json(
      { error: "Use mp4, mov, webm, or mkv." },
      { status: 400 },
    );
  }

  const maxBytes = maxUploadBytes();
  if (!Number.isFinite(byteSize) || byteSize < 1 || byteSize > maxBytes) {
    return NextResponse.json(
      { error: `File must be between 1 byte and ${maxBytes} bytes.` },
      { status: 400 },
    );
  }

  try {
    const asset = await prisma.asset.create({
      data: {
        userId: actor.userId,
        status: "uploading",
        originalKey: "pending",
        fileName,
        contentType,
        byteSize,
      },
    });

    const originalKey = `uploads/${actor.userId}/${asset.id}/${fileName}`;
    await prisma.asset.update({
      where: { id: asset.id },
      data: { originalKey },
    });

    const uploadUrl = await presignPut(originalKey, contentType);

    return NextResponse.json({
      assetId: asset.id,
      uploadUrl,
      objectKey: originalKey,
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "UNKNOWN";
    return NextResponse.json(
      { error: code === "P2003" ? "Session is stale. Sign out and sign in again." : "Could not start upload." },
      { status: code === "P2003" ? 401 : 500 },
    );
  }
}
