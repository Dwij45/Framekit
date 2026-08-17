"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

export function HlsPlayer({
  src,
  poster,
}: {
  src: string;
  poster?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);

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

  return (
    <video
      ref={ref}
      className="player"
      controls
      playsInline
      poster={poster ?? undefined}
    />
  );
}
