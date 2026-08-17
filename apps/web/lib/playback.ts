type RenditionLike = { kind: string; label: string };

export function playbackFor(assetId: string, renditions: RenditionLike[]) {
  const hasMaster = renditions.some((r) => r.kind === "hls_master");
  const hasPoster = renditions.some((r) => r.kind === "poster");
  return {
    hls: hasMaster ? `/api/v1/playback/${assetId}/hls/master.m3u8` : null,
    poster: hasPoster ? `/api/v1/playback/${assetId}/poster.jpg` : null,
    mp4: renditions
      .filter((r) => r.kind === "mp4")
      .map((r) => ({
        label: r.label,
        url: `/api/v1/playback/${assetId}/mp4/${r.label}.mp4`,
      })),
  };
}

export function safePlaybackRel(parts: string[]): string | null {
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!part || part === "." || part === ".." || /[\\/\0]/.test(part)) {
      return null;
    }
  }
  return parts.join("/");
}

export function mimeForPlayback(rel: string, fallback?: string | null): string {
  if (rel.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (rel.endsWith(".ts")) return "video/MP2T";
  if (rel.endsWith(".mp4")) return "video/mp4";
  if (rel.endsWith(".jpg") || rel.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "application/octet-stream";
}
