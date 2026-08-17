import { statusLabel } from "@/lib/labels";

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ready"
      ? "ok"
      : status === "failed"
        ? "bad"
        : status === "uploading" || status === "queued" || status === "probing" || status === "encoding" || status === "packaging"
          ? "busy"
          : "neutral";
  return <span className={`pill pill-${tone}`}>{statusLabel(status)}</span>;
}
