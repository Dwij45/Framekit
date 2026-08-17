import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export function mintApiKey(live = false): { plaintext: string; prefix: string } {
  const kind = live ? "live" : "test";
  const idPart = randomBytes(4).toString("hex");
  const secretPart = randomBytes(24).toString("hex");
  const prefix = `fk_${kind}_${idPart}`;
  return { plaintext: `${prefix}_${secretPart}`, prefix };
}

export function parseApiKeyToken(token: string): { prefix: string } | null {
  const match = token.trim().match(/^(fk_(?:test|live)_[a-f0-9]{8})_[a-f0-9]{48}$/);
  if (!match) return null;
  return { prefix: match[1] };
}

export async function hashApiKey(plaintext: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(plaintext, salt, 32)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyApiKeyHash(plaintext: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = (await scrypt(plaintext, salt, 32)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
