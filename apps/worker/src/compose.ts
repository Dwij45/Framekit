import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@framekit/db";
import { clipOutDuration, compileTimelineArgs, parseTimeline } from "@framekit/shared";
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

async function probeFile(filePath: string): Promise<ProbeJson> {
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

export async function processComposeJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { asset: true },
  });

  if (!job) throw new Error(`Job ${jobId} missing`);
  if (job.type !== "compose") return;
  if (job.status !== "queued") return;

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

  const timeline = parseTimeline(job.specJson ?? {});
  const ids = [...new Set(timeline.clips.map((c) => c.assetId))];
  const sources = await prisma.asset.findMany({
    where: { id: { in: ids }, userId: job.userId },
    include: { renditions: true },
  });
  const byId = new Map(sources.map((a) => [a.id, a]));
  for (const clip of timeline.clips) {
    if (!byId.has(clip.assetId)) {
      throw new Error(`Clip asset ${clip.assetId} is missing or not owned by this job's user`);
    }
  }

  const dir = await mkdtemp(path.join(tmpdir(), "framekit-compose-"));
  const outMp4 = path.join(dir, "out.mp4");
  const outDir = path.join(dir, "out");
  const downloaded = new Map<string, { path: string; probe: ProbeJson }>();

  try {
    await mkdir(outDir, { recursive: true });

    for (const asset of sources) {
      const mp4Rendition = [...asset.renditions]
        .filter((r) => r.kind === "mp4")
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
      const sourceKey = mp4Rendition?.storageKey ?? asset.originalKey;
      const dest = path.join(dir, `${asset.id}.mp4`);
      await downloadObjectToFile(sourceKey, dest);
      downloaded.set(asset.id, { path: dest, probe: await probeFile(dest) });
    }

    const clipPaths: string[] = [];
    const clipHasAudio: boolean[] = [];
    const clipDurationSec: number[] = [];
    let estimated = 0;

    for (const clip of timeline.clips) {
      const row = downloaded.get(clip.assetId);
      if (!row) throw new Error(`Missing download for ${clip.assetId}`);
      clipPaths.push(ffmpegPath(row.path));
      clipHasAudio.push(Boolean(row.probe.streams?.some((s) => s.codec_type === "audio")));
      const durationSec = Number(row.probe.format?.duration ?? 0);
      clipDurationSec.push(durationSec);
      estimated += clipOutDuration(clip, durationSec);
    }

    const args = compileTimelineArgs(timeline, {
      clipPaths,
      clipHasAudio,
      clipDurationSec,
      output: ffmpegPath(outMp4),
      overlayPath: timeline.overlay ? ffmpegPath(logoPath) : undefined,
    });

    const outDuration = Math.max(estimated, 0.1);
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
      outProbe = await probeFile(outMp4);
    } catch {
      outProbe = {};
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
    const posterSeek = Number(outProbe.format?.duration ?? 0) > 1.2 ? "1" : "0";
    try {
      await runCommand(ffmpegBin(), [
        "-y",
        "-ss",
        posterSeek,
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
        durationSec: Number(outProbe.format?.duration ?? estimated),
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
    const message = err instanceof Error ? err.message : "Compose failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        progressStage: "failed",
        errorCode: "COMPOSE_FAILED",
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
