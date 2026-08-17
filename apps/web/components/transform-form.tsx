"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TransformForm({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assets/${assetId}/transforms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quality: String(form.get("quality") ?? "default"),
          aspect: form.get("aspect") ? String(form.get("aspect")) : undefined,
          speed: Number(form.get("speed") ?? 1),
          mute: form.get("mute") === "on",
          watermark: form.get("watermark") === "on" ? { x: 24, y: 24 } : false,
        }),
      });
      const body = (await res.json()) as { error?: string; jobId?: string };
      if (!res.ok || !body.jobId) {
        throw new Error(body.error ?? "Could not start transform.");
      }
      router.push(`/jobs/${body.jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transform failed.");
      setPending(false);
    }
  }

  return (
    <form className="transform-form" onSubmit={(e) => void onSubmit(e)}>
      <h2 className="subhead">Transform</h2>
      <p className="muted">
        This queues a new job on the worker. Next.js only stores the knobs.
        Output is a new asset (the source file stays).
      </p>
      <label className="field">
        Quality
        <select name="quality" defaultValue="default">
          <option value="high">High (CRF 18)</option>
          <option value="default">Default (CRF 23)</option>
          <option value="small">Small (CRF 28)</option>
        </select>
      </label>
      <label className="field">
        Aspect
        <select name="aspect" defaultValue="9:16">
          <option value="">Keep source</option>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
        </select>
      </label>
      <label className="field">
        Speed
        <select name="speed" defaultValue="1">
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" name="mute" defaultChecked />
        Mute
      </label>
      <label className="check">
        <input type="checkbox" name="watermark" defaultChecked />
        Logo overlay
      </label>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Queueing…" : "Run transform"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
