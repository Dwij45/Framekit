"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@framekit/shared";
import { HlsPlayer } from "@/components/hls-player";

export function CaptionLookPanel({
  assetId,
  src,
  poster,
  spriteVtt,
  captions,
  captionStyleUrl,
  hasCaptions,
}: {
  assetId: string;
  src: string;
  poster?: string | null;
  spriteVtt?: string | null;
  captions?: Array<{ lang: string; url: string }>;
  captionStyleUrl?: string | null;
  hasCaptions: boolean;
}) {
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!captionStyleUrl) return;
    let cancelled = false;
    void fetch(captionStyleUrl, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json || typeof json !== "object") return;
        setStyle({
          font: json.font === "serif" || json.font === "mono" ? json.font : "sans",
          color: json.color === "yellow" || json.color === "black" ? json.color : "white",
          background:
            json.background === "none" || json.background === "white"
              ? json.background
              : "black",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [captionStyleUrl]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/assets/${assetId}/captions/style`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(style),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save caption look.");
      setMessage("Saved. Refresh if CC does not update.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save caption look.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="caption-look">
      <HlsPlayer
        src={src}
        poster={poster}
        spriteVtt={spriteVtt}
        captions={captions}
        captionStyleUrl={captionStyleUrl}
        captionStyle={style}
      />
      <div className="panel caption-style-panel">
        <h2 className="subhead">Caption look</h2>
        <p className="muted">
          Sidecar subtitles — not burned into the video. Change font, color, and
          background box. Preview updates live; save to keep it.
        </p>
        {!hasCaptions ? (
          <p className="muted">Generate captions first, then style them here.</p>
        ) : null}
        <div className="field-grid">
          <label className="field">
            Font
            <select
              value={style.font}
              onChange={(e) =>
                setStyle((s) => ({ ...s, font: e.target.value as CaptionStyle["font"] }))
              }
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="field">
            Text
            <select
              value={style.color}
              onChange={(e) =>
                setStyle((s) => ({ ...s, color: e.target.value as CaptionStyle["color"] }))
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
              value={style.background}
              onChange={(e) =>
                setStyle((s) => ({
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
        <button className="btn-ghost" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save caption look"}
        </button>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </div>
  );
}
