import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@framekit/db";
import { buildSpriteVtt, spritePlan } from "@framekit/shared";
import { uploadFile } from "@framekit/storage";
import { ffmpegBin, ffmpegPath, runCommand } from "./ffmpeg.js";

export async function publishSpriteSheet(opts: {
  assetId: string;
  input: string;
  durationSec: number;
  workDir: string;
}): Promise<void> {
  const plan = spritePlan(opts.durationSec);
  const sprite = path.join(opts.workDir, "sprite.jpg");
  const vttPath = path.join(opts.workDir, "sprite.vtt");
  const fps = `1/${plan.interval}`;
  const vf = [
    `fps=${fps}`,
    `scale=${plan.tileW}:${plan.tileH}:force_original_aspect_ratio=decrease`,
    `pad=${plan.tileW}:${plan.tileH}:(ow-iw)/2:(oh-ih)/2`,
    `tile=${plan.cols}x${plan.rows}`,
  ].join(",");

  await runCommand(ffmpegBin(), [
    "-y",
    "-i",
    ffmpegPath(opts.input),
    "-vf",
    vf,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    ffmpegPath(sprite),
  ]);
  await writeFile(vttPath, buildSpriteVtt(plan), "utf8");

  await prisma.rendition.deleteMany({
    where: { assetId: opts.assetId, kind: { in: ["sprite", "sprite_vtt"] } },
  });

  const spriteKey = `assets/${opts.assetId}/sprite.jpg`;
  const spriteSize = await uploadFile(spriteKey, sprite, "image/jpeg");
  await prisma.rendition.create({
    data: {
      assetId: opts.assetId,
      kind: "sprite",
      label: "sprite",
      storageKey: spriteKey,
      mime: "image/jpeg",
      width: plan.cols * plan.tileW,
      height: plan.rows * plan.tileH,
      byteSize: spriteSize,
    },
  });

  const vttKey = `assets/${opts.assetId}/sprite.vtt`;
  const vttSize = await uploadFile(vttKey, vttPath, "text/vtt");
  await prisma.rendition.create({
    data: {
      assetId: opts.assetId,
      kind: "sprite_vtt",
      label: "sprite",
      storageKey: vttKey,
      mime: "text/vtt",
      byteSize: vttSize,
    },
  });
}
