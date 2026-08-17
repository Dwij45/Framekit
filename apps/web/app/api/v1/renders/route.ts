import { NextResponse } from "next/server";
import { prisma } from "@framekit/db";
import { parseTimeline } from "@framekit/shared";
import { composeQueue } from "@/lib/queue";
import {
  assertUnderUsageCap,
  findIdempotentJob,
  readJsonWithIdempotency,
  requireAuth,
} from "@/lib/auth-request";
import { createJobOrReplay } from "@/lib/job-create";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let timeline;
  let idempotencyKey: string | null = null;
  let bodyHash: string;
  try {
    const parsed = await readJsonWithIdempotency(req);
    idempotencyKey = parsed.idempotencyKey;
    bodyHash = parsed.bodyHash;
    timeline = parseTimeline(parsed.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid timeline";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (idempotencyKey) {
    const found = await findIdempotentJob(actor.userId, idempotencyKey, bodyHash);
    if (found.kind === "conflict") {
      return NextResponse.json(
        { error: "Idempotency-Key was reused with a different body." },
        { status: 409 },
      );
    }
    if (found.kind === "replay") {
      return NextResponse.json({
        jobId: found.job.id,
        assetId: found.job.assetId,
        replayed: true,
      });
    }
  }

  const cap = await assertUnderUsageCap(actor.userId);
  if (cap) {
    return NextResponse.json({ error: cap, errorCode: "USAGE_CAP" }, { status: 429 });
  }

  const ids = [...new Set(timeline.clips.map((c) => c.assetId))];
  const sources = await prisma.asset.findMany({
    where: { id: { in: ids }, userId: actor.userId, status: "ready" },
    include: { renditions: { where: { kind: "mp4" }, take: 1 } },
  });
  if (sources.length !== ids.length) {
    return NextResponse.json(
      { error: "Every clips[].assetId must be a ready asset you own." },
      { status: 400 },
    );
  }
  if (sources.some((a) => a.renditions.length === 0)) {
    return NextResponse.json(
      { error: "Every clip needs an MP4 rendition before compose." },
      { status: 409 },
    );
  }

  const first = sources.find((a) => a.id === timeline.clips[0].assetId) ?? sources[0];
  const outName = `${first.fileName} (compose · ${timeline.clips.length} clips)`;

  const output = await prisma.asset.create({
    data: {
      userId: actor.userId,
      status: "uploading",
      originalKey: "pending",
      fileName: outName.slice(0, 180),
      contentType: "video/mp4",
    },
  });

  const created = await createJobOrReplay({
    userId: actor.userId,
    assetId: output.id,
    type: "compose",
    sourceAssetId: first.id,
    specJson: timeline,
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
    await composeQueue.add("compose", { jobId: created.job.id });
  }

  return NextResponse.json({
    jobId: created.job.id,
    assetId: created.job.assetId,
    replayed: created.replay,
  });
}
