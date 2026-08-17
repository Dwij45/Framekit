import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@framekit/db";
import { downloadObjectToFile, uploadFile } from "@framekit/storage";
import { maxDurationSec, pickLadder } from "@framekit/shared";
import {
  ffmpegBin,
  ffmpegPath,
  ffprobeBin,
  parseFfmpegTime,
  runCommand,
  runCommandStdout,
} from "./ffmpeg.js";

type ProbeJson = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
};

function fail(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

async function runFfprobe(filePath: string): Promise<ProbeJson> {
  const stdout = await runCommandStdout(ffprobeBin(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    ffmpegPath(filePath),
  ]);
  return JSON.parse(stdout) as ProbeJson;
}

function summarize(probe: ProbeJson) {
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const duration = Number(probe.format?.duration ?? 0);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(probe.streams?.some((s) => s.codec_type === "audio")),
  };
}

async function setJob(
  jobId: string,
  data: {
    status?: "queued" | "probing" | "encoding" | "packaging" | "ready" | "failed";
    progressPct?: number;
    progressStage?: string;
  },
) {
  await prisma.job.update({ where: { id: jobId }, data });
}

export async function processIngestJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { asset: true },
  });

  if (!job) throw new Error(`Job ${jobId} missing`);
  if (job.status !== "queued") return;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "probing",
      progressStage: "probing",
      progressPct: 5,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
    },
  });

  const dir = await mkdtemp(path.join(tmpdir(), "framekit-"));
  const dest = path.join(dir, job.asset.fileName);
  const outDir = path.join(dir, "out");

  try {
    await downloadObjectToFile(job.asset.originalKey, dest);
    let probe: ProbeJson;
    try {
      probe = await runFfprobe(dest);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ffprobe failed";
      fail(message, "NOT_VIDEO");
    }
    const summary = summarize(probe);

    if (!summary.hasVideo) fail("No video stream in this file.", "NOT_VIDEO");
    if (summary.durationSec > maxDurationSec()) {
      fail(`Duration ${summary.durationSec.toFixed(1)}s over limit.`, "TOO_LONG");
    }

    await prisma.asset.update({
      where: { id: job.assetId },
      data: { probeJson: probe as object, errorMessage: null },
    });

    const rungs = pickLadder(summary.height || 720);
    await mkdir(outDir, { recursive: true });

    const duration = Math.max(summary.durationSec, 0.1);
    const encoded: Array<{ label: string; height: number; mp4: string; bandwidth: number }> = [];

    for (let i = 0; i < rungs.length; i++) {
      const rung = rungs[i];
      const mp4 = path.join(outDir, `${rung.label}.mp4`);
      await setJob(jobId, {
        status: "encoding",
        progressStage: `encoding:${rung.label}`,
        progressPct: 10 + Math.round((i / rungs.length) * 60),
      });

      let lastWrite = 0;
      let progressWrite: Promise<void> | null = null;
      const audioArgs = summary.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"];
      await runCommand(
        ffmpegBin(),
        [
          "-y",
          "-i",
          ffmpegPath(dest),
          "-vf",
          `scale=-2:${rung.height}`,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-fps_mode",
          "cfr",
          ...audioArgs,
          "-movflags",
          "+faststart",
          ffmpegPath(mp4),
        ],
        (text) => {
          const t = parseFfmpegTime(text);
          if (t == null) return;
          const now = Date.now();
          if (now - lastWrite < 1000 || progressWrite) return;
          lastWrite = now;
          const inner = Math.min(1, t / duration);
          const pct = 10 + Math.round(((i + inner) / rungs.length) * 60);
          progressWrite = setJob(jobId, {
            progressPct: pct,
            progressStage: `encoding:${rung.label}`,
          }).finally(() => {
            progressWrite = null;
          });
        },
      );

      encoded.push({ ...rung, mp4 });
    }

    await setJob(jobId, { status: "packaging", progressStage: "hls", progressPct: 78 });

    const hlsRoot = path.join(outDir, "hls");
    await mkdir(hlsRoot, { recursive: true });
    const masterLines = ["#EXTM3U", "#EXT-X-VERSION:3"];

    function scaledWidth(height: number) {
      return Math.max(
        2,
        Math.round((summary.width * height) / Math.max(summary.height, 1) / 2) * 2,
      );
    }

    for (const rung of encoded) {
      const variantDir = path.join(hlsRoot, rung.label);
      await mkdir(variantDir, { recursive: true });
      const playlist = path.join(variantDir, "playlist.m3u8");
      const width = scaledWidth(rung.height);
      await runCommand(ffmpegBin(), [
        "-y",
        "-i",
        ffmpegPath(rung.mp4),
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
      masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rung.bandwidth},RESOLUTION=${width}x${rung.height}`);
      masterLines.push(`${rung.label}/playlist.m3u8`);
    }

    const masterPath = path.join(hlsRoot, "master.m3u8");
    await writeFile(masterPath, `${masterLines.join("\n")}\n`);

    await setJob(jobId, { progressStage: "poster", progressPct: 88 });
    const poster = path.join(outDir, "poster.jpg");
    const posterSs = summary.durationSec > 1.2 ? "1" : "0";
    try {
      await runCommand(ffmpegBin(), [
        "-y",
        "-ss",
        posterSs,
        "-i",
        ffmpegPath(dest),
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
        ffmpegPath(dest),
        "-frames:v",
        "1",
        "-q:v",
        "4",
        ffmpegPath(poster),
      ]);
    }

    await prisma.rendition.deleteMany({ where: { assetId: job.assetId } });

    for (const rung of encoded) {
      const key = `assets/${job.assetId}/mp4/${rung.label}.mp4`;
      const size = await uploadFile(key, rung.mp4, "video/mp4");
      await prisma.rendition.create({
        data: {
          assetId: job.assetId,
          kind: "mp4",
          label: rung.label,
          storageKey: key,
          mime: "video/mp4",
          width: scaledWidth(rung.height),
          height: rung.height,
          byteSize: size,
        },
      });
    }

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

    for (const rung of encoded) {
      const variantDir = path.join(hlsRoot, rung.label);
      const files = await readdir(variantDir);
      for (const file of files) {
        const mime = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T";
        await uploadFile(
          `assets/${job.assetId}/hls/${rung.label}/${file}`,
          path.join(variantDir, file),
          mime,
        );
      }
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

    await prisma.asset.update({
      where: { id: job.assetId },
      data: { status: "ready", errorMessage: null },
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "ENCODE_FAILED";

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        progressStage: "failed",
        errorCode: code,
        errorMessage: message.slice(0, 1800),
        finishedAt: new Date(),
      },
    });
    await prisma.asset.update({
      where: { id: job.assetId },
      data: { status: "failed", errorMessage: message.slice(0, 1800) },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
