export const JOB_STATUSES = [
  "queued",
  "probing",
  "encoding",
  "packaging",
  "ready",
  "failed",
  "canceled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const ALLOWED_UPLOAD_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export function maxUploadBytes(): number {
  const n = Number(process.env.PROBE_MAX_BYTES ?? 524_288_000);
  return Number.isFinite(n) ? n : 524_288_000;
}

export function maxDurationSec(): number {
  const n = Number(process.env.PROBE_MAX_DURATION_SEC ?? 600);
  return Number.isFinite(n) ? n : 600;
}

export const LADDER = [
  { label: "360p", height: 360, bandwidth: 800_000 },
  { label: "720p", height: 720, bandwidth: 2_500_000 },
  { label: "1080p", height: 1080, bandwidth: 4_500_000 },
] as const;

export function pickLadder(sourceHeight: number) {
  const rungs = LADDER.filter((r) => sourceHeight >= r.height);
  if (rungs.length > 0) return [...rungs];
  const h = Math.max(2, Math.floor(sourceHeight / 2) * 2);
  return [{ label: `${h}p`, height: h, bandwidth: 400_000 }];
}

export function safeFileName(name: string): string {
  const trimmed = name.replace(/\\/g, "/").split("/").pop() ?? "upload.bin";
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "upload.bin";
}
