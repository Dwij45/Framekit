"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Uploader() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

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
    <div className="uploader">
      <label className="btn-primary upload-label">
        {pending ? "Uploading…" : "Upload a video"}
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          disabled={pending}
          onChange={onChange}
        />
      </label>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
