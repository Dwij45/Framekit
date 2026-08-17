import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhook(secret: string, timestampSec: number, rawBody: string): string {
  const mac = createHmac("sha256", secret).update(`${timestampSec}.${rawBody}`).digest("hex");
  return `t=${timestampSec},v1=${mac}`;
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  rawBody: string,
  nowSec = Math.floor(Date.now() / 1000),
  maxSkewSec = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const idx = piece.indexOf("=");
      return [piece.slice(0, idx).trim(), piece.slice(idx + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(timestamp) || !v1 || !/^[a-f0-9]{64}$/.test(v1)) return false;
  if (Math.abs(nowSec - timestamp) > maxSkewSec) return false;
  const expected = signWebhook(secret, timestamp, rawBody);
  const expectedMac = expected.slice(expected.indexOf("v1=") + 3);
  const a = Buffer.from(v1, "hex");
  const b = Buffer.from(expectedMac, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
