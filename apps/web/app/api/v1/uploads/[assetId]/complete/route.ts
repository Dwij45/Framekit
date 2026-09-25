import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { parseIngestSpec, usageMonthKey } from "@framekit/shared";
import { headObject } from "@framekit/storage";
import { ingestQueue } from "@/lib/queue";
import { assertUnderUsageCap, findIdempotentJob, requireAuth, readJsonWithIdempotency } from "@/lib/auth-request";
import { createJobOrReplay } from "@/lib/job-create";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let idempotencyKey: string | null = null;
  let bodyHash: string;
  let spec;
  try {
    const parsed = await readJsonWithIdempotency(req);
    idempotencyKey = parsed.idempotencyKey;
    bodyHash = parsed.bodyHash;
    spec = parseIngestSpec(parsed.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const cap = await assertUnderUsageCap(actor.userId);
  if (cap) {
    return NextResponse.json({ error: cap, errorCode: "USAGE_CAP" }, { status: 429 });
  }

  const { assetId } = await ctx.params;
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: actor.userId },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.status !== "uploading") {
    if (idempotencyKey) {
      const found = await findIdempotentJob(actor.userId, idempotencyKey, bodyHash);
      if (found.kind === "conflict") {
        return NextResponse.json(
          { error: "Idempotency-Key was reused with a different body." },
          { status: 409 },
        );
      }
      if (found.kind === "replay") {
        return NextResponse.json({ jobId: found.job.id, assetId: asset.id, replayed: true });
      }
    }
    return NextResponse.json({ error: "Upload already completed." }, { status: 409 });
  }

  try {
    const head = await headObject(asset.originalKey);
    const stored = head.ContentLength ?? 0;
    if (stored > 0) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { byteSize: stored },
      });
      await prisma.usageMonth.upsert({
        where: { userId_yyyymm: { userId: actor.userId, yyyymm: usageMonthKey() } },
        create: { userId: actor.userId, yyyymm: usageMonthKey(), uploadBytes: BigInt(stored) },
        update: { uploadBytes: { increment: BigInt(stored) } },
      });
    }
  } catch {
    return NextResponse.json(
      { error: "File not found in storage. Finish the upload first." },
      { status: 400 },
    );
  }

  const created = await createJobOrReplay({
    userId: actor.userId,
    assetId: asset.id,
    type: "ingest_transcode",
    specJson: spec,
    apiKeyId: actor.apiKeyId,
    idempotencyKey,
    bodyHash,
  });
  if ("conflict" in created && created.conflict) {
    return NextResponse.json(
      { error: "Idempotency-Key was reused with a different body." },
      { status: 409 },
    );
  }
  if (!created.replay) {
    await ingestQueue.add("ingest", { jobId: created.job.id });
  }

  return NextResponse.json({
    jobId: created.job.id,
    assetId: asset.id,
    replayed: created.replay,
  });
}
