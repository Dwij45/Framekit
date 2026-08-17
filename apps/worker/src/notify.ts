import { prisma } from "@framekit/db";
import { durationMsFromProbe, usageMonthKey } from "@framekit/shared";
import { webhookQueue } from "./queues.js";

export async function onJobTerminal(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { asset: true },
  });
  if (!job) return;

  if (job.status === "ready" && !job.usageRecorded) {
    const encodedMs = durationMsFromProbe(job.asset.probeJson);
    if (encodedMs > 0) {
      const yyyymm = usageMonthKey();
      await prisma.$transaction([
        prisma.usageMonth.upsert({
          where: { userId_yyyymm: { userId: job.userId, yyyymm } },
          create: { userId: job.userId, yyyymm, encodedMs },
          update: { encodedMs: { increment: encodedMs } },
        }),
        prisma.job.update({
          where: { id: job.id },
          data: { usageRecorded: true },
        }),
      ]);
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: { usageRecorded: true },
      });
    }
  }

  const event = job.status === "ready" ? "job.completed" : job.status === "failed" ? "job.failed" : null;
  if (!event) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: job.userId, disabledAt: null },
  });
  const payload = {
    event,
    job_id: job.id,
    asset_id: job.assetId,
    status: job.status,
  };

  for (const endpoint of endpoints) {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        jobId: job.id,
        event,
        payloadJson: payload,
      },
    });
    await webhookQueue.add(
      "deliver",
      { deliveryId: delivery.id },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    );
  }
}
