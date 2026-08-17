import { lookup } from "node:dns/promises";
import { isPrivateIPv4, isPrivateIPv6, parseWebhookUrl } from "./webhook-url";

export function webhookSafetyOpts() {
  const allowLoopback = process.env.NODE_ENV !== "production";
  return { allowHttp: allowLoopback, allowLoopback };
}

export async function assertSafeWebhookUrl(input: string): Promise<URL> {
  const opts = webhookSafetyOpts();
  const url = parseWebhookUrl(input, opts);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return url;
  }
  const { address, family } = await lookup(host);
  const blocked = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
  if (blocked && !opts.allowLoopback) {
    throw new Error("Webhook URL resolved to a private IP.");
  }
  return url;
}
