import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export function ffprobeBin(): string {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const packed = ffprobeStatic as { path?: string } | string;
  if (typeof packed === "string") return packed;
  if (packed?.path) return packed.path;
  throw new Error("ffprobe binary not found");
}

export function ffmpegBin(): string {
  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH !== "ffmpeg") {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegStatic) return ffmpegStatic;
  throw new Error("ffmpeg binary not found");
}

/** FFmpeg on Windows is happier with forward slashes in -i / -hls_segment_filename. */
export function ffmpegPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export function parseFfmpegTime(chunk: string): number | null {
  const match = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

export function runCommand(
  bin: string,
  args: string[],
  onStderr?: (text: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stderr += text;
      onStderr?.(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-2000) || `${bin} exited ${code}`));
    });
  });
}

export function runCommandStdout(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      stdout += buf.toString();
    });
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.slice(-2000) || `${bin} exited ${code}`));
    });
  });
}
