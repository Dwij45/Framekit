import "../src/load-env.js";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { prisma } from "@framekit/db";
import { hashApiKey, mintApiKey, parseTransformSpec, verifyWebhookSignature } from "@framekit/shared";

const apiBase = process.env.FRAMEKIT_API ?? "http://127.0.0.1:3000";

type Json = Record<string, unknown>;

async function api(path: string, init: RequestInit & { key: string }): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${init.key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Json = {};
  if (text) {
    try {
      body = JSON.parse(text) as Json;
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}

async function main() {
  const source = await prisma.asset.findFirst({
    where: { status: "ready", renditions: { some: { kind: "mp4" } } },
    orderBy: { createdAt: "desc" },
  });
  if (!source) throw new Error("No ready asset with an MP4 — run smoke-1bcd.ts first.");

  const minted = mintApiKey(false);
  await prisma.apiKey.create({
    data: {
      userId: source.userId,
      name: "smoke-4",
      prefix: minted.prefix,
      secretHash: await hashApiKey(minted.plaintext),
    },
  });

  const received: Array<{ signature: string; body: string }> = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      received.push({
        signature: String(req.headers["x-framekit-signature"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(18765, "127.0.0.1", resolve));

  try {
    const hook = await api("/api/v1/webhooks", {
      method: "POST",
      key: minted.plaintext,
      body: JSON.stringify({ url: "http://127.0.0.1:18765/hook" }),
    });
    if (hook.status !== 200 || typeof hook.body.secret !== "string") {
      throw new Error(`webhook register failed ${hook.status} ${JSON.stringify(hook.body)}`);
    }
    const signingSecret = hook.body.secret;

    const spec = parseTransformSpec({ mute: true, watermark: false, speed: 1 });
    const idem = `smoke-4-${randomUUID()}`;
    const payload = JSON.stringify(spec);
    const first = await api(`/api/v1/assets/${source.id}/transforms`, {
      method: "POST",
      key: minted.plaintext,
      headers: { "Idempotency-Key": idem },
      body: payload,
    });
    if (first.status !== 200 || typeof first.body.jobId !== "string") {
      throw new Error(`transform failed ${first.status} ${JSON.stringify(first.body)}`);
    }
    const second = await api(`/api/v1/assets/${source.id}/transforms`, {
      method: "POST",
      key: minted.plaintext,
      headers: { "Idempotency-Key": idem },
      body: payload,
    });
    if (second.body.jobId !== first.body.jobId || second.body.replayed !== true) {
      throw new Error(`idempotency replay failed ${JSON.stringify(second.body)}`);
    }
    console.log("[smoke-4] job", first.body.jobId, "replay ok");

    const started = Date.now();
    let status = "queued";
    while (Date.now() - started < 6 * 60 * 1000) {
      const row = await api(`/api/v1/jobs/${first.body.jobId}`, {
        method: "GET",
        key: minted.plaintext,
      });
      status = String(row.body.status ?? "");
      console.log(`[smoke-4] ${status} ${row.body.progressPct ?? 0}%`);
      if (status === "ready") break;
      if (status === "failed") {
        throw new Error(`${row.body.errorCode}: ${row.body.errorMessage}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (status !== "ready") throw new Error("job timed out");

    const hookDeadline = Date.now() + 30_000;
    while (Date.now() < hookDeadline && received.length === 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (received.length === 0) throw new Error("webhook never arrived");
    const event = JSON.parse(received[0].body) as { event?: string };
    if (event.event !== "job.completed") {
      throw new Error(`unexpected webhook ${received[0].body}`);
    }
    const ok = verifyWebhookSignature(signingSecret, received[0].signature, received[0].body);
    if (!ok) throw new Error("webhook signature mismatch");
    console.log("[smoke-4] webhook job.completed signature ok");

    const usage = await api("/api/v1/usage", { method: "GET", key: minted.plaintext });
    console.log("[smoke-4] usage", usage.body);
    console.log("[smoke-4] OK");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main()
  .catch((err) => {
    console.error("[smoke-4] FAIL", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
