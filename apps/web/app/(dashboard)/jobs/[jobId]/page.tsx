import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { JobPoller } from "@/components/job-poller";
import Link from "next/link";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await auth();
  const { jobId } = await params;
  if (!session?.user?.id) notFound();

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: session.user.id },
    include: { asset: true },
  });
  if (!job) notFound();

  return (
    <section>
      <p className="muted">
        <Link href="/jobs">Jobs</Link>
        {" · "}
        <Link href={`/assets/${job.assetId}`}>{job.asset.fileName}</Link>
      </p>
      <h1>Inspect job</h1>
      <p className="lede">
        Ingest jobs probe and encode a ladder. Transform jobs apply one
        FFmpeg graph from dashboard knobs. This page polls every 1.5s.
      </p>
      <JobPoller jobId={job.id} />
    </section>
  );
}
