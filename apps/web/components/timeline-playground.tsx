"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ReadyAsset = { id: string; fileName: string };

function exampleJson(id: string): string {
  return JSON.stringify(
    {
      clips: [
        { assetId: id, trimStart: 0, trimEnd: 2 },
        { assetId: id, trimStart: 2, trimEnd: 5 },
      ],
      overlay: { x: 24, y: 24 },
      mute: true,
    },
    null,
    2,
  );
}

export function TimelinePlayground({ assets }: { assets: ReadyAsset[] }) {
  const router = useRouter();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const starter = useMemo(() => exampleJson(assetId || "yourReadyAssetId"), [assetId]);
  const [text, setText] = useState(starter);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = assets.find((a) => a.id === assetId);

  function onPick(id: string) {
    setAssetId(id);
    setText(exampleJson(id));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("The timeline must be valid JSON.");
      }
      const res = await fetch("/api/v1/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: string; jobId?: string };
      if (!res.ok || !payload.jobId) {
        throw new Error(payload.error ?? "Could not start the timeline job.");
      }
      router.push(`/jobs/${payload.jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the timeline job.");
      setPending(false);
    }
  }

  return (
    <form className="panel timeline-form" onSubmit={(e) => void onSubmit(e)}>
      <label className="field">
        Source video
        <select value={assetId} onChange={(e) => onPick(e.target.value)}>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fileName}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Default recipe: first 2 seconds of {selected?.fileName ?? "this file"}, then
        seconds 2–5, muted, with a small logo. You can edit the JSON. Only
        clips you own are allowed.
      </p>
      <label className="field">
        Recipe
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={14}
        />
      </label>
      <button className="btn-primary" type="submit" disabled={pending || !assetId}>
        {pending ? "Starting…" : "Create this video"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
