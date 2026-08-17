"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisableWebhookButton({ endpointId }: { endpointId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await fetch(`/api/v1/webhooks/${endpointId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button className="btn-ghost" type="button" disabled={pending} onClick={() => void onClick()}>
      {pending ? "Disabling…" : "Disable"}
    </button>
  );
}
