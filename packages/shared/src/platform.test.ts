import assert from "node:assert/strict";
import test from "node:test";
import { hashApiKey, mintApiKey, parseApiKeyToken, verifyApiKeyHash } from "./api-key";
import { signWebhook, verifyWebhookSignature } from "./webhook-sign";
import { parseWebhookUrl } from "./webhook-url";

test("mints fk_test_ keys and round-trips scrypt", async () => {
  const { plaintext, prefix } = mintApiKey(false);
  assert.match(plaintext, /^fk_test_[a-f0-9]{8}_[a-f0-9]{48}$/);
  assert.equal(parseApiKeyToken(plaintext)?.prefix, prefix);
  const stored = await hashApiKey(plaintext);
  assert.equal(await verifyApiKeyHash(plaintext, stored), true);
  assert.equal(await verifyApiKeyHash(`${plaintext}x`, stored), false);
  assert.equal(parseApiKeyToken("fk_test_not-a-key;rm"), null);
});

test("webhook HMAC verifies and rejects tampering", () => {
  const body = JSON.stringify({ event: "job.completed", job_id: "j1" });
  const header = signWebhook("whsec_test", 1_700_000_000, body);
  assert.equal(verifyWebhookSignature("whsec_test", header, body, 1_700_000_000), true);
  assert.equal(verifyWebhookSignature("whsec_test", header, body.replace("j1", "j2"), 1_700_000_000), false);
  assert.equal(verifyWebhookSignature("other", header, body, 1_700_000_000), false);
});

test("webhook URL rejects private targets", () => {
  assert.throws(() => parseWebhookUrl("http://example.com/hook"));
  assert.throws(() => parseWebhookUrl("https://127.0.0.1/hook"));
  assert.throws(() => parseWebhookUrl("https://169.254.169.254/latest"));
  assert.throws(() => parseWebhookUrl("https://localhost/hook"));
  const ok = parseWebhookUrl("https://webhook.site/abc");
  assert.equal(ok.hostname, "webhook.site");
  const local = parseWebhookUrl("http://127.0.0.1:18765/hook", {
    allowHttp: true,
    allowLoopback: true,
  });
  assert.equal(local.port, "18765");
});
