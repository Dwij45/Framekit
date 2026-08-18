import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@framekit/db";
import { parseTransformSpec } from "@framekit/shared";
import { compileTransformArgs } from "@framekit/shared/compile";
import { downloadObjectToFile, uploadFile } from "@framekit/storage";
import { ffmpegBin, ffmpegPath, ffprobeBin, parseFfmpegTime, runCommand, runCommandStdout } from "./ffmpeg.js";
import { onJobTerminal } from "./notify.js";
import { publishSpriteSheet } from "./sprites.js";

const logoPath = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../assets/logo.png");

type ProbeJson = {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
};

async function setJob(
  jobId: string,
  data: {
    status?: "queued" | "encoding" | "packaging" | "ready" | "failed";
    progressPct?: number;
    progressStage?: string;
  },
) {
  await prisma.job.update({ where: { id: jobId }, data });
}

export async function processTransformJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      asset: true,
      sourceAsset: { include: { renditions: true } },
    },
  });

  if (!job) throw new Error(`Job ${jobId} missing`);
  if (job.type !== "transform") return;
  if (job.status !== "queued") return;
  if (!job.sourceAsset) throw new Error("Transform job has no source asset");

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "encoding",
      progressStage: "encoding",
      progressPct: 8,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
    },
  });

  const spec = parseTransformSpec(job.specJson ?? {});
  const source = job.sourceAsset;
  const mp4Rendition = [...source.renditions]
    .filter((r) => r.kind === "mp4")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  const sourceKey = mp4Rendition?.storageKey ?? source.originalKey;

  const probe = source.probeJson as ProbeJson | null;
  const video = probe?.streams?.find((s) => s.codec_type === "video");
  const durationSec = Number(probe?.format?.duration ?? 0);
  const srcWidth = video?.width ?? 1280;
  const srcHeight = video?.height ?? 720;
  const sourceHasAudio = Boolean(probe?.streams?.some((s) => s.codec_type === "audio"));

  const dir = await mkdtemp(path.join(tmpdir(), "framekit-xf-"));
  const dest = path.join(dir, "source.mp4");
  const outMp4 = path.join(dir, "out.mp4");
  const outDir = path.join(dir, "out");

  try {
    await downloadObjectToFile(sourceKey, dest);
    await mkdir(outDir, { recursive: true });

    const args = compileTransformArgs(spec, {
      input: ffmpegPath(dest),
      output: ffmpegPath(outMp4),
      srcWidth,
      srcHeight,
      hasAudio: sourceHasAudio,
      watermarkPath: spec.watermark ? ffmpegPath(logoPath) : undefined,
    });

    const outDuration = Math.max(durationSec / (spec.speed || 1), 0.1);
    let lastWrite = 0;
    let progressWrite: Promise<void> | null = null;
    await runCommand(ffmpegBin(), args, (text) => {
      const t = parseFfmpegTime(text);
      if (t == null) return;
      const now = Date.now();
      if (now - lastWrite < 1000 || progressWrite) return;
      lastWrite = now;
      const pct = 10 + Math.round(Math.min(1, t / outDuration) * 65);
      progressWrite = setJob(jobId, { progressPct: pct, progressStage: "encoding" }).finally(() => {
        progressWrite = null;
      });
    });

    let outProbe: ProbeJson = {};
    try {
      const stdout = await runCommandStdout(ffprobeBin(), [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        ffmpegPath(outMp4),
      ]);
      outProbe = JSON.parse(stdout) as ProbeJson;
    } catch {
      outProbe = source.probeJson as ProbeJson;
    }

    await setJob(jobId, { status: "packaging", progressStage: "hls", progressPct: 80 });

    const hlsRoot = path.join(outDir, "hls");
    const variantDir = path.join(hlsRoot, "main");
    await mkdir(variantDir, { recursive: true });
    const playlist = path.join(variantDir, "playlist.m3u8");
    await runCommand(ffmpegBin(), [
      "-y",
      "-i",
      ffmpegPath(outMp4),
      "-codec",
      "copy",
      "-start_number",
      "0",
      "-hls_time",
      "4",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      ffmpegPath(path.join(variantDir, "seg_%03d.ts")),
      ffmpegPath(playlist),
    ]);
    const masterPath = path.join(hlsRoot, "master.m3u8");
    await writeFile(
      masterPath,
      `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2500000\nmain/playlist.m3u8\n`,
    );

    const poster = path.join(outDir, "poster.jpg");
    try {
      await runCommand(ffmpegBin(), [
        "-y",
        "-ss",
        durationSec > 1.2 ? "1" : "0",
        "-i",
        ffmpegPath(outMp4),
        "-frames:v",
        "1",
        "-q:v",
        "4",
        ffmpegPath(poster),
      ]);
    } catch {
      await runCommand(ffmpegBin(), [
        "-y",
        "-i",
        ffmpegPath(outMp4),
        "-frames:v",
        "1",
        "-q:v",
        "4",
        ffmpegPath(poster),
      ]);
    }

    await prisma.rendition.deleteMany({ where: { assetId: job.assetId } });

    const mp4Key = `assets/${job.assetId}/mp4/main.mp4`;
    const mp4Size = await uploadFile(mp4Key, outMp4, "video/mp4");
    await prisma.rendition.create({
      data: {
        assetId: job.assetId,
        kind: "mp4",
        label: "main",
        storageKey: mp4Key,
        mime: "video/mp4",
        byteSize: mp4Size,
      },
    });

    const masterKey = `assets/${job.assetId}/hls/master.m3u8`;
    await uploadFile(masterKey, masterPath, "application/vnd.apple.mpegurl");
    await prisma.rendition.create({
      data: {
        assetId: job.assetId,
        kind: "hls_master",
        label: "master",
        storageKey: masterKey,
        mime: "application/vnd.apple.mpegurl",
      },
    });

    const files = await readdir(variantDir);
    for (const file of files) {
      const mime = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T";
      await uploadFile(`assets/${job.assetId}/hls/main/${file}`, path.join(variantDir, file), mime);
    }

    const posterKey = `assets/${job.assetId}/poster.jpg`;
    const posterSize = await uploadFile(posterKey, poster, "image/jpeg");
    await prisma.rendition.create({
      data: {
        assetId: job.assetId,
        kind: "poster",
        label: "poster",
        storageKey: posterKey,
        mime: "image/jpeg",
        byteSize: posterSize,
      },
    });

    try {
      await publishSpriteSheet({
        assetId: job.assetId,
        input: outMp4,
        durationSec: Number(outProbe.format?.duration ?? durationSec),
        workDir: outDir,
      });
    } catch (err) {
      console.error("[worker] sprite failed", jobId, err);
    }

    await prisma.asset.update({
      where: { id: job.assetId },
      data: {
        status: "ready",
        originalKey: mp4Key,
        probeJson: (outProbe as object) ?? undefined,
        errorMessage: null,
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
    const message = err instanceof Error ? err.message : "Transform failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        progressStage: "failed",
        errorCode: "TRANSFORM_FAILED",
        errorMessage: message.slice(0, 1800),
        finishedAt: new Date(),
      },
    });
    await prisma.asset.update({
      where: { id: job.assetId },
      data: { status: "failed", errorMessage: message.slice(0, 1800) },
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
