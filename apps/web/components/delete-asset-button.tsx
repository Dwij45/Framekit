"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAssetButton({
  assetId,
  redirectTo,
}: {
  assetId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Remove this video and its files? This cannot be undone.")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assets/${assetId}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not remove the video.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the video.");
      setPending(false);
    }
  }

  return (
    <span className="asset-delete">
      <button className="btn-ghost danger" type="button" disabled={pending} onClick={(e) => void onClick(e)}>
        {pending ? "Removing…" : "Remove"}
      </button>
      {error ? <span className="form-error"> {error}</span> : null}
    </span>
  );
}
