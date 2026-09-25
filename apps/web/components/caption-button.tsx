"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CaptionButton({
  assetId,
  hasCaptions = false,
}: {
  assetId: string;
  hasCaptions?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assets/${assetId}/captions`, { method: "POST" });
      const body = (await res.json()) as { error?: string; jobId?: string };
      if (!res.ok || !body.jobId) throw new Error(body.error ?? "Could not start captions.");
      router.push(`/jobs/${body.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start captions.");
      setPending(false);
    }
  }

  return (
    <p>
      <button className="btn-ghost" type="button" disabled={pending} onClick={() => void onClick()}>
        {pending ? "Starting…" : hasCaptions ? "Regenerate captions" : "Generate captions"}
      </button>
      {error ? <span className="form-error"> {error}</span> : null}
    </p>
  );
}
