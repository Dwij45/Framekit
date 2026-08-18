"use client";

import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";

type SpriteCue = { start: number; end: number; x: number; y: number; w: number; h: number };

function parseClock(h: string, m: string, s: string) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function parseSpriteVtt(text: string): SpriteCue[] {
  const cues: SpriteCue[] = [];
  const re =
    /(\d+):(\d+):(\d+(?:\.\d+)?)\s+-->\s+(\d+):(\d+):(\d+(?:\.\d+)?)\s+sprite\.jpg#xywh=(\d+),(\d+),(\d+),(\d+)/g;
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ");
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    cues.push({
      start: parseClock(match[1], match[2], match[3]),
      end: parseClock(match[4], match[5], match[6]),
      x: Number(match[7]),
      y: Number(match[8]),
      w: Number(match[9]),
      h: Number(match[10]),
    });
  }
  return cues;
}

export function HlsPlayer({
  src,
  poster,
  spriteVtt,
  captions,
}: {
  src: string;
  poster?: string | null;
  spriteVtt?: string | null;
  captions?: Array<{ lang: string; url: string }>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [cues, setCues] = useState<SpriteCue[]>([]);
  const [trackUrls, setTrackUrls] = useState<Array<{ lang: string; url: string }>>([]);
  const [hover, setHover] = useState<{ t: number; cue: SpriteCue; x: number } | null>(null);
  const spriteSrc = spriteVtt ? spriteVtt.replace(/sprite\.vtt$/, "sprite.jpg") : null;
  const captionKey = useMemo(
    () => (captions ?? []).map((cap) => `${cap.lang}:${cap.url}`).join("|"),
    [captions],
  );

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({
      xhrSetup(xhr) {
        xhr.withCredentials = true;
      },
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (!spriteVtt) {
      setCues([]);
      return;
    }
    let cancelled = false;
    void fetch(spriteVtt, { credentials: "include" })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!cancelled) setCues(parseSpriteVtt(text));
      });
    return () => {
      cancelled = true;
    };
  }, [spriteVtt]);

  useEffect(() => {
    if (!captionKey) {
      setTrackUrls([]);
      return;
    }
    const list = captions ?? [];
    let cancelled = false;
    const blobs: string[] = [];
    void Promise.all(
      list.map(async (cap) => {
        const res = await fetch(cap.url, { credentials: "include" });
        if (!res.ok) return null;
        const url = URL.createObjectURL(await res.blob());
        blobs.push(url);
        return { lang: cap.lang, url };
      }),
    ).then((rows) => {
      if (cancelled) {
        blobs.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setTrackUrls(rows.filter((row): row is { lang: string; url: string } => Boolean(row)));
    });
    return () => {
      cancelled = true;
      blobs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [captionKey, captions]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const video = ref.current;
    if (!video || cues.length === 0) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = ratio * duration;
    const cue = cues.find((c) => t >= c.start && t < c.end) ?? cues[cues.length - 1];
    setHover({ t, cue, x: ratio * rect.width });
  }

  return (
    <div
      className="player-wrap"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <video
        ref={ref}
        className="player"
        controls
        playsInline
        crossOrigin="use-credentials"
        poster={poster ?? undefined}
      >
        {trackUrls.map((cap) => (
          <track
            key={cap.lang}
            kind="subtitles"
            srcLang={cap.lang}
            label={cap.lang === "eng" ? "English" : cap.lang}
            src={cap.url}
            default
          />
        ))}
      </video>
      {hover && spriteSrc ? (
        <div
          className="sprite-preview"
          style={{ left: Math.max(8, hover.x - hover.cue.w / 2) }}
          aria-hidden
        >
          <span
            className="sprite-tile"
            style={{
              width: hover.cue.w,
              height: hover.cue.h,
              backgroundImage: `url(${spriteSrc})`,
              backgroundPosition: `-${hover.cue.x}px -${hover.cue.y}px`,
            }}
          />
          <span className="sprite-time">{hover.t.toFixed(1)}s</span>
        </div>
      ) : null}
    </div>
  );
}
