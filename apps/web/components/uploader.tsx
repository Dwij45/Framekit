"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CaptionStyle } from "@framekit/shared";

const DEFAULT_STYLE: CaptionStyle = {
  font: "sans",
  color: "white",
  background: "black",
};

export function Uploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [maxHeight, setMaxHeight] = useState<360 | 720 | 1080>(1080);
  const [quality, setQuality] = useState<"high" | "default" | "small">("default");
  const [aspect, setAspect] = useState<"" | "16:9" | "9:16" | "1:1">("");
  const [speed, setSpeed] = useState(1);
  const [mute, setMute] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_STYLE);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a video first.");
      return;
    }

    setError(null);
    setPending(true);
    setMessage("Asking for an upload slot…");

    try {
      const start = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "video/mp4",
          byteSize: file.size,
        }),
      });
      const raw = await start.text();
      let startBody: { error?: string; assetId?: string; uploadUrl?: string };
      try {
        startBody = raw ? (JSON.parse(raw) as typeof startBody) : {};
      } catch {
        throw new Error(`Upload API returned non-JSON (${start.status}).`);
      }
      if (!start.ok || !startBody.uploadUrl || !startBody.assetId) {
        throw new Error(startBody.error ?? "Could not start upload.");
      }

      setMessage("Sending the file to storage…");
      const put = await fetch(startBody.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`Storage rejected the file (${put.status}).`);
      }

      setMessage("Starting encode…");
      const done = await fetch(`/api/v1/uploads/${startBody.assetId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxHeight,
          quality,
          aspect: aspect || undefined,
          speed,
          mute,
          watermark: watermark ? { x: 24, y: 24 } : false,
          captions,
          captionStyle: captions ? captionStyle : undefined,
        }),
      });
      const doneBody = (await done.json()) as { error?: string; jobId?: string };
      if (!done.ok || !doneBody.jobId) {
        throw new Error(doneBody.error ?? "Could not queue inspect job.");
      }

      router.push(`/jobs/${doneBody.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPending(false);
      setMessage(null);
    }
  }

  return (
    <form className="panel upload-form" onSubmit={(e) => void onSubmit(e)}>
      <header className="upload-form-head">
        <h2 className="subhead">New job</h2>
        <p className="muted">
          Set how the worker should encode this file. Speed, crop, mute, and logo
          are applied during upload. Captions are a sidecar track — style them
          below, then toggle CC on the player.
        </p>
      </header>

      <fieldset className="upload-section" disabled={pending}>
        <legend>File</legend>
        <label className="field">
          Video
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        {file ? <p className="muted file-picked">{file.name}</p> : null}
      </fieldset>

      <fieldset className="upload-section" disabled={pending}>
        <legend>Encode</legend>
        <div className="field-grid">
          <label className="field">
            Max resolution
            <select
              value={maxHeight}
              onChange={(e) => setMaxHeight(Number(e.target.value) as 360 | 720 | 1080)}
            >
              <option value={360}>360p</option>
              <option value={720}>720p</option>
              <option value={1080}>1080p</option>
            </select>
          </label>
          <label className="field">
            Quality
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as "high" | "default" | "small")}
            >
              <option value="high">High (bigger file)</option>
              <option value="default">Default</option>
              <option value="small">Small (more compress)</option>
            </select>
          </label>
          <label className="field">
            Aspect
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as "" | "16:9" | "9:16" | "1:1")}
            >
              <option value="">Keep source</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16 (Reels)</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <label className="field">
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </label>
        </div>
        <p className="muted">Never upscales. A 720p phone clip stays ≤720p.</p>
        <div className="check-row">
          <label className="check">
            <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} />
            Mute
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={watermark}
              onChange={(e) => setWatermark(e.target.checked)}
            />
            Logo overlay
          </label>
        </div>
      </fieldset>

      <fieldset className="upload-section" disabled={pending}>
        <legend>Captions</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={captions}
            onChange={(e) => setCaptions(e.target.checked)}
          />
          Generate English captions after encode
        </label>
        {captions ? (
          <div className="field-grid">
            <label className="field">
              Font
              <select
                value={captionStyle.font}
                onChange={(e) =>
                  setCaptionStyle((s) => ({
                    ...s,
                    font: e.target.value as CaptionStyle["font"],
                  }))
                }
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </label>
            <label className="field">
              Text color
              <select
                value={captionStyle.color}
                onChange={(e) =>
                  setCaptionStyle((s) => ({
                    ...s,
                    color: e.target.value as CaptionStyle["color"],
                  }))
                }
              >
                <option value="white">White</option>
                <option value="yellow">Yellow</option>
                <option value="black">Black</option>
              </select>
            </label>
            <label className="field">
              Background
              <select
                value={captionStyle.background}
                onChange={(e) =>
                  setCaptionStyle((s) => ({
                    ...s,
                    background: e.target.value as CaptionStyle["background"],
                  }))
                }
              >
                <option value="black">Black box</option>
                <option value="white">White box</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="muted">Turn this on if the clip has speech. You can still generate later.</p>
        )}
      </fieldset>

      <button className="btn-primary" type="submit" disabled={pending || !file}>
        {pending ? "Uploading…" : "Upload and start job"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
