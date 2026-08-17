import { even } from "./compile-transform";
import type { Timeline } from "./timeline-spec";

export function clipOutDuration(
  clip: { trimStart?: number; trimEnd?: number },
  sourceDurationSec: number,
): number {
  const start = clip.trimStart ?? 0;
  const end = clip.trimEnd ?? sourceDurationSec;
  return Math.max(0.05, end - start);
}

function trimVideo(start?: number, end?: number): string[] {
  const parts: string[] = [];
  if (start != null && end != null) parts.push(`trim=${start}:${end}`);
  else if (start != null) parts.push(`trim=start=${start}`);
  else if (end != null) parts.push(`trim=end=${end}`);
  parts.push("setpts=PTS-STARTPTS");
  return parts;
}

function trimAudio(start?: number, end?: number): string[] {
  const parts: string[] = [];
  if (start != null && end != null) parts.push(`atrim=${start}:${end}`);
  else if (start != null) parts.push(`atrim=start=${start}`);
  else if (end != null) parts.push(`atrim=end=${end}`);
  parts.push("asetpts=PTS-STARTPTS");
  return parts;
}

export function compileTimelineArgs(
  timeline: Timeline,
  ctx: {
    clipPaths: string[];
    clipHasAudio?: boolean[];
    clipDurationSec?: number[];
    output: string;
    overlayPath?: string;
    width?: number;
    height?: number;
  },
): string[] {
  if (ctx.clipPaths.length !== timeline.clips.length) {
    throw new Error("clipPaths length must match clips");
  }

  const w = even(ctx.width ?? 1280);
  const h = even(ctx.height ?? 720);
  const wantOverlay = Boolean(timeline.overlay) && Boolean(ctx.overlayPath);
  const n = timeline.clips.length;

  const args: string[] = ["-y"];
  for (const p of ctx.clipPaths) {
    args.push("-i", p);
  }
  if (wantOverlay && ctx.overlayPath) {
    args.push("-i", ctx.overlayPath);
  }

  const chains: string[] = [];
  const concatPads: string[] = [];

  for (let i = 0; i < n; i++) {
    const clip = timeline.clips[i];
    const v = [
      ...trimVideo(clip.trimStart, clip.trimEnd),
      `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
      "fps=30",
      "format=yuv420p",
    ].join(",");
    chains.push(`[${i}:v]${v}[v${i}]`);
    concatPads.push(`[v${i}]`);
    if (!timeline.mute) {
      const hasAudio = ctx.clipHasAudio?.[i] ?? true;
      if (hasAudio) {
        const a = [
          ...trimAudio(clip.trimStart, clip.trimEnd),
          "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo",
        ].join(",");
        chains.push(`[${i}:a]${a}[a${i}]`);
      } else {
        const dur = clipOutDuration(clip, ctx.clipDurationSec?.[i] ?? 10);
        chains.push(
          `anullsrc=r=44100:cl=stereo,atrim=0:${dur},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`,
        );
      }
      concatPads.push(`[a${i}]`);
    }
  }

  if (timeline.mute) {
    chains.push(`${concatPads.join("")}concat=n=${n}:v=1:a=0[vc]`);
  } else {
    chains.push(`${concatPads.join("")}concat=n=${n}:v=1:a=1[vc][ac]`);
  }

  let vout = "[vc]";
  if (wantOverlay) {
    const pos = timeline.overlay === false ? { x: 24, y: 24 } : timeline.overlay;
    const overlayIn = n;
    let overlay = `[vc][${overlayIn}:v]overlay=${pos.x}:${pos.y}`;
    if (pos.start != null || pos.duration != null) {
      const start = pos.start ?? 0;
      const end = pos.duration != null ? start + pos.duration : 600;
      overlay += `:enable=between(t\\,${start}\\,${end})`;
    }
    overlay += "[vout]";
    chains.push(overlay);
    vout = "[vout]";
  }

  args.push("-filter_complex", chains.join(";"));
  args.push("-map", vout);
  if (timeline.mute) {
    args.push("-an");
  } else {
    args.push("-map", "[ac]");
    args.push("-c:a", "aac", "-b:a", "128k");
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    ctx.output,
  );
  return args;
}
