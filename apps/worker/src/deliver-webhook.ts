import { prisma } from "@framekit/db";
import { signWebhook } from "@framekit/shared";
import { assertSafeWebhookUrl } from "@framekit/shared/webhooks";

export async function processWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true, job: true },
  });
  if (!delivery) throw new Error(`Delivery ${deliveryId} missing`);
  if (delivery.endpoint.disabledAt) return;
  if (delivery.deliveredAt) return;

  const rawBody = JSON.stringify(delivery.payloadJson);
  const timestampSec = Math.floor(Date.now() / 1000);
  const signature = signWebhook(delivery.endpoint.secret, timestampSec, rawBody);

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { attempts: { increment: 1 }, nextRetryAt: new Date(Date.now() + 15_000) },
  });

  const url = await assertSafeWebhookUrl(delivery.endpoint.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-framekit-signature": signature,
        "x-framekit-event": delivery.event,
      },
      body: rawBody,
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 300);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { statusCode: res.status, lastError: snippet || `HTTP ${res.status}` },
      });
      throw new Error(`Webhook HTTP ${res.status}`);
    }
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode: res.status,
        deliveredAt: new Date(),
        lastError: null,
        nextRetryAt: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook failed";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
