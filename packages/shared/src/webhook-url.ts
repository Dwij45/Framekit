export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

export function parseWebhookUrl(
  input: string,
  opts?: { allowHttp?: boolean; allowLoopback?: boolean },
): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Webhook URL is invalid.");
  }
  const allowHttp = Boolean(opts?.allowHttp);
  const allowLoopback = Boolean(opts?.allowLoopback);
  if (url.protocol === "http:") {
    if (!allowHttp) throw new Error("Webhook URL must be https.");
  } else if (url.protocol !== "https:") {
    throw new Error("Webhook URL must be https.");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL must not include credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    if (!allowLoopback) throw new Error("Webhook URL must not point at loopback.");
    return url;
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    if (!allowLoopback) throw new Error("Webhook URL must not point at a private IP.");
  }
  return url;
}
