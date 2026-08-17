export function usageMonthKey(at = new Date()): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function usageCapMs(): number {
  const minutes = Number(process.env.USAGE_CAP_MINUTES ?? 120);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes * 60 * 1000);
}

export function durationMsFromProbe(probe: unknown): number {
  const sec = Number(
    probe && typeof probe === "object" && "format" in probe
      ? (probe as { format?: { duration?: string } }).format?.duration
      : 0,
  );
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec * 1000);
}
