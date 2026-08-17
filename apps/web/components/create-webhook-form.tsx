"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateWebhookForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: String(form.get("url") ?? "") }),
      });
      const body = (await res.json()) as { error?: string; secret?: string };
      if (!res.ok || !body.secret) throw new Error(body.error ?? "Could not register webhook.");
      setSecret(body.secret);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register webhook.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
      <label className="field">
        HTTPS URL
        <input name="url" placeholder="https://webhook.site/your-id" required />
      </label>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add endpoint"}
      </button>
      {secret ? (
        <p className="secret-once">
          Signing secret (copy now):
          <code>{secret}</code>
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
