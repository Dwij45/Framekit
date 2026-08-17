import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { parseTransformSpec } from "@framekit/shared";
import { transformQueue } from "@/lib/queue";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const source = await prisma.asset.findFirst({
    where: { id: assetId, userId },
    include: { renditions: { where: { kind: "mp4" }, take: 1 } },
  });
  if (!source) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (source.status !== "ready") {
    return NextResponse.json({ error: "Asset is not ready to transform." }, { status: 409 });
  }

  let spec;
  try {
    spec = parseTransformSpec(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid transform spec";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const label = [spec.aspect, spec.mute ? "mute" : null, spec.watermark ? "logo" : null]
    .filter(Boolean)
    .join(" · ");
  const outName = label ? `${source.fileName} (${label})` : `${source.fileName} (transform)`;

  const output = await prisma.asset.create({
    data: {
      userId,
      status: "uploading",
      originalKey: "pending",
      fileName: outName.slice(0, 180),
      contentType: "video/mp4",
    },
  });

  const job = await prisma.job.create({
    data: {
      userId,
      assetId: output.id,
      sourceAssetId: source.id,
      type: "transform",
      status: "queued",
      progressStage: "queued",
      specJson: spec,
    },
  });

  await transformQueue.add("transform", { jobId: job.id });

  return NextResponse.json({ jobId: job.id, assetId: output.id });
}
