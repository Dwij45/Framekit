import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@framekit/db";
import { buildCaptionsVtt, durationMsFromProbe, type CaptionCue } from "@framekit/shared";
import { downloadObjectToFile, uploadFile } from "@framekit/storage";
import { ffmpegBin, ffmpegPath, runCommand } from "./ffmpeg.js";
import { onJobTerminal } from "./notify.js";
import { captionQueue } from "./queues.js";

/** Node has no AudioContext — pass PCM floats. We always extract 16 kHz mono s16le. */
export function decodeMonoWav(buf: Buffer): { raw: Float32Array; sampling_rate: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("caption audio is not a WAV");
  }
  const sampleRate = buf.readUInt32LE(24);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const pcm = buf.subarray(offset + 8, offset + 8 + size);
      const count = Math.floor(pcm.length / 2);
      const raw = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        raw[i] = pcm.readInt16LE(i * 2) / 32768;
      }
      return { raw, sampling_rate: sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk missing");
}

function whisperCacheDir(): string {
  const base = process.env.LOCALAPPDATA ?? process.env.HOME ?? tmpdir();
  return path.join(base, "framekit", "whisper");
}

export async function enqueueCaptionJob(userId: string, assetId: string): Promise<string> {
  const existing = await prisma.job.findFirst({
    where: { assetId, type: "caption", status: { in: ["queued", "encoding"] } },
  });
  if (existing) return existing.id;

  const job = await prisma.job.create({
    data: {
      userId,
      assetId,
      sourceAssetId: assetId,
      type: "caption",
      status: "queued",
      progressStage: "queued",
    },
  });
  await captionQueue.add("caption", { jobId: job.id });
  return job.id;
}

function cuesFromWhisper(result: {
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number, number | null] }>;
}, durationSec: number): CaptionCue[] {
  const chunks = result.chunks ?? [];
  const cues: CaptionCue[] = [];
  for (const chunk of chunks) {
    const start = Number(chunk.timestamp?.[0] ?? 0);
    const end = Number(chunk.timestamp?.[1] ?? start + 1);
    const text = String(chunk.text ?? "").trim();
    if (text) cues.push({ start, end: Number.isFinite(end) ? end : start + 1, text });
  }
  if (cues.length === 0 && result.text?.trim()) {
    cues.push({ start: 0, end: Math.max(0.5, durationSec), text: result.text.trim() });
  }
  return cues;
}

export async function processCaptionJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { asset: { include: { renditions: true } } },
  });
  if (!job) throw new Error(`Job ${jobId} missing`);
  if (job.type !== "caption") return;
  if (job.status !== "queued") return;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "encoding",
      progressStage: "transcribing",
      progressPct: 10,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
    },
  });

  const mp4 = [...job.asset.renditions]
    .filter((r) => r.kind === "mp4")
    .sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0];
  const sourceKey = mp4?.storageKey ?? job.asset.originalKey;
  const dir = await mkdtemp(path.join(tmpdir(), "framekit-cap-"));

  try {
    const dest = path.join(dir, "source.mp4");
    const wav = path.join(dir, "audio.wav");
    await downloadObjectToFile(sourceKey, dest);
    await runCommand(ffmpegBin(), [
      "-y",
      "-i",
      ffmpegPath(dest),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      ffmpegPath(wav),
    ]);

    await prisma.job.update({
      where: { id: jobId },
      data: { progressPct: 35, progressStage: "transcribing" },
    });

    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = whisperCacheDir();
    await mkdir(env.cacheDir, { recursive: true });
    const transcribe = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en");
    const { raw: samples } = decodeMonoWav(await readFile(wav));
    const raw = (await transcribe(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })) as {
      text?: string;
      chunks?: Array<{ text?: string; timestamp?: [number, number | null] }>;
    };
    const durationSec = durationMsFromProbe(job.asset.probeJson) / 1000;
    const vtt = buildCaptionsVtt(cuesFromWhisper(raw, durationSec || 3));
    const vttPath = path.join(dir, "eng.vtt");
    await writeFile(vttPath, vtt, "utf8");

    await prisma.rendition.deleteMany({
      where: { assetId: job.assetId, kind: "captions" },
    });
    const key = `assets/${job.assetId}/captions/eng.vtt`;
    const size = await uploadFile(key, vttPath, "text/vtt");
    await prisma.rendition.create({
      data: {
        assetId: job.assetId,
        kind: "captions",
        label: "eng",
        storageKey: key,
        mime: "text/vtt",
        byteSize: size,
      },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "ready",
        progressPct: 100,
        progressStage: "ready",
        finishedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    try {
      await onJobTerminal(jobId);
    } catch (err) {
      console.error("[worker] notify failed", jobId, err);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Caption failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        progressStage: "failed",
        errorCode: "CAPTION_FAILED",
        errorMessage: message.slice(0, 1800),
        finishedAt: new Date(),
      },
    });
    try {
      await onJobTerminal(jobId);
    } catch (notifyErr) {
      console.error("[worker] notify failed", jobId, notifyErr);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
