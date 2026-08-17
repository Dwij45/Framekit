import { prisma } from "@framekit/db";
import { findIdempotentJob } from "@/lib/auth-request";

type JobType = "ingest_transcode" | "transform" | "compose";

export async function createJobOrReplay(opts: {
  userId: string;
  assetId: string;
  type: JobType;
  sourceAssetId?: string | null;
  specJson?: object | null;
  apiKeyId?: string | null;
  idempotencyKey: string | null;
  bodyHash: string;
}) {
  if (opts.idempotencyKey) {
    const found = await findIdempotentJob(opts.userId, opts.idempotencyKey, opts.bodyHash);
    if (found.kind === "conflict") return { conflict: true as const };
    if (found.kind === "replay") return { job: found.job, replay: true as const };
  }

  try {
    const job = await prisma.job.create({
      data: {
        userId: opts.userId,
        assetId: opts.assetId,
        type: opts.type,
        status: "queued",
        progressStage: "queued",
        sourceAssetId: opts.sourceAssetId ?? undefined,
        specJson: opts.specJson ?? undefined,
        apiKeyId: opts.apiKeyId ?? undefined,
        idempotencyKey: opts.idempotencyKey ?? undefined,
        idempotencyHash: opts.idempotencyKey ? opts.bodyHash : undefined,
      },
    });
    return { job, replay: false as const };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (opts.idempotencyKey && code === "P2002") {
      const found = await findIdempotentJob(opts.userId, opts.idempotencyKey, opts.bodyHash);
      if (found.kind === "conflict") return { conflict: true as const };
      if (found.kind === "replay") return { job: found.job, replay: true as const };
    }
    throw err;
  }
}
