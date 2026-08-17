"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeKeyButton({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await fetch(`/api/v1/api-keys/${keyId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button className="btn-ghost" type="button" disabled={pending} onClick={() => void onClick()}>
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}
