"use client";

import { useEffect, useState } from "react";
import { HlsPlayer } from "@/components/hls-player";
import { StatusPill } from "@/components/status-pill";

type Payload = {
  id: string;
  type: string;
  status: string;
  progressPct: number;
  progressStage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  assetId: string;
  probe: unknown;
  canRetry: boolean;
  playback: {
    hls: string | null;
    poster: string | null;
    spriteVtt: string | null;
    captions: Array<{ lang: string; url: string }>;
    mp4: Array<{ label: string; url: string }>;
  };
};

const ACTIVE = new Set(["queued", "probing", "encoding", "packaging"]);

export function JobPoller({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const abort = new AbortController();

    async function tick() {
      try {
        const res = await fetch(`/api/v1/jobs/${jobId}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!res.ok) {
          if (!cancelled) setError("Could not load job.");
          return;
        }
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        setError(null);
        setData(json);
        if (ACTIVE.has(json.status)) {
          timer = window.setTimeout(tick, 2500);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        if (!cancelled) setError("Could not load job.");
      }
    }

    void tick();
    return () => {
      cancelled = true;
      abort.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, generation]);

  async function retry() {
    setRetrying(true);
    setError(null);
    const res = await fetch(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
    const body = (await res.json()) as { error?: string };
    setRetrying(false);
    if (!res.ok) {
      setError(body.error ?? "Retry failed.");
      return;
    }
    setGeneration((n) => n + 1);
  }

  if (!data) {
    if (error) return <p className="form-error">{error}</p>;
    return <p className="muted">Loading job…</p>;
  }

  const probe = data.probe as
    | {
        format?: { duration?: string };
        streams?: Array<{ codec_type?: string; width?: number; height?: number; codec_name?: string }>;
      }
    | null;
  const video = probe?.streams?.find((s) => s.codec_type === "video");
  const working = ACTIVE.has(data.status);

  return (
    <div className="stack">
      <p className="inline-status">
        <StatusPill status={data.status} />
        <span>{data.progressPct}%</span>
      </p>
      <div className="meter" aria-label="progress">
        <span style={{ width: `${data.progressPct}%` }} />
      </div>
      {working && data.type === "caption" ? (
        <p className="muted">Writing subtitles. You can leave this page — the video is already playable.</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {data.status === "failed" ? (
        <p className="form-error">{data.errorMessage}</p>
      ) : null}
      {data.canRetry ? (
        <p>
          <button className="btn-ghost" type="button" disabled={retrying} onClick={() => void retry()}>
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : null}
      {data.playback.hls ? (
        <>
          <HlsPlayer
            src={data.playback.hls}
            poster={data.playback.poster}
            spriteVtt={data.playback.spriteVtt}
            captions={data.playback.captions}
          />
          <p className="muted downloads">
            {video ? (
              <span>
                {Number(probe?.format?.duration ?? 0).toFixed(1)}s · {video.width}×{video.height}
              </span>
            ) : null}
            {data.playback.mp4.map((r) => (
              <a key={r.label} href={r.url}>
                {r.label} MP4
              </a>
            ))}
          </p>
        </>
      ) : null}
    </div>
  );
}
