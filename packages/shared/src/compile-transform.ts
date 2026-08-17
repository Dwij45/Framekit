import { QUALITY_CRF, type TransformSpec } from "./transform-spec";

export function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

export function cropForAspect(
  srcW: number,
  srcH: number,
  aspect: "16:9" | "9:16" | "1:1",
): string | null {
  const [aw, ah] = aspect.split(":").map(Number);
  const target = aw / ah;
  const src = srcW / Math.max(srcH, 1);
  if (Math.abs(src - target) < 0.02) return null;
  if (src > target) {
    const w = even(srcH * target);
    const x = even((srcW - w) / 2);
    return `crop=${w}:${even(srcH)}:${x}:0`;
  }
  const h = even(srcW / target);
  const y = even((srcH - h) / 2);
  return `crop=${even(srcW)}:${h}:0:${y}`;
}

function videoFilters(spec: TransformSpec, srcW: number, srcH: number): string[] {
  const parts: string[] = [];
  if (spec.aspect) {
    const crop = cropForAspect(srcW, srcH, spec.aspect);
    if (crop) parts.push(crop);
  }
  if (spec.fit) {
    const w = even(spec.fit.width);
    const h = even(spec.fit.height);
    parts.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    parts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
  }
  if (spec.speed !== 1) {
    parts.push(`setpts=PTS/${spec.speed}`);
  }
  parts.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  parts.push("format=yuv420p");
  return parts;
}

export function compileTransformArgs(
  spec: TransformSpec,
  ctx: {
    input: string;
    output: string;
    srcWidth: number;
    srcHeight: number;
    hasAudio: boolean;
    watermarkPath?: string;
  },
): string[] {
  const vf = videoFilters(spec, ctx.srcWidth, ctx.srcHeight).join(",");
  const crf = String(QUALITY_CRF[spec.quality]);
  const wantWm = Boolean(spec.watermark) && Boolean(ctx.watermarkPath);
  const args: string[] = ["-y", "-i", ctx.input];

  if (wantWm && ctx.watermarkPath) {
    const pos = spec.watermark === false ? { x: 24, y: 24 } : spec.watermark;
    args.push("-i", ctx.watermarkPath);
    args.push(
      "-filter_complex",
      `[0:v]${vf}[base];[base][1:v]overlay=${pos.x}:${pos.y}:format=auto[vout]`,
    );
    args.push("-map", "[vout]");
  } else {
    args.push("-vf", vf);
  }

  args.push("-c:v", "libx264", "-preset", "fast", "-crf", crf, "-pix_fmt", "yuv420p", "-fps_mode", "cfr");

  const audioOut = ctx.hasAudio && !spec.mute;
  if (!audioOut) {
    args.push("-an");
  } else if (spec.speed !== 1) {
    args.push("-c:a", "aac", "-b:a", "128k", "-filter:a", `atempo=${spec.speed}`);
    if (wantWm) args.push("-map", "0:a");
  } else {
    args.push("-c:a", "aac", "-b:a", "128k");
    if (wantWm) args.push("-map", "0:a");
  }

  args.push("-movflags", "+faststart", ctx.output);
  return args;
}
