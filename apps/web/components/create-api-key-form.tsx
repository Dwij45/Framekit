"use client";

import { useState } from "react";

export function CreateApiKeyForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(form.get("name") ?? "default") }),
      });
      const body = (await res.json()) as { error?: string; key?: string };
      if (!res.ok || !body.key) throw new Error(body.error ?? "Could not create key.");
      setSecret(body.key);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
      <label className="field">
        Name
        <input name="name" defaultValue="curl" maxLength={80} />
      </label>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create key"}
      </button>
      {secret ? (
        <p className="secret-once">
          Copy this now. It is not stored in plaintext.
          <code>{secret}</code>
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
