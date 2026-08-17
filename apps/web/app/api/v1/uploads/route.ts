import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { presignPut } from "@framekit/storage";
import { ALLOWED_UPLOAD_TYPES, maxUploadBytes, safeFileName } from "@framekit/shared";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fileName?: string; contentType?: string; byteSize?: number };
  try {
    body = await req.json();
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

  const asset = await prisma.asset.create({
    data: {
      userId,
      status: "uploading",
      originalKey: "pending",
      fileName,
      contentType,
      byteSize,
    },
  });

  const originalKey = `uploads/${userId}/${asset.id}/${fileName}`;
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
}
