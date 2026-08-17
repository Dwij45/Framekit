import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { JobPoller } from "@/components/job-poller";
import { jobTypeLabel } from "@/lib/labels";
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

  const kind = jobTypeLabel(job.type);
  const blurb =
    job.type === "transform"
      ? "This edit creates a new video from knobs you set. The original file is unchanged."
      : job.type === "compose"
        ? "This timeline stitch creates one new video from the clips you listed."
        : "This upload job inspects the file, encodes a quality ladder, and packages HLS.";

  return (
    <section className="page">
      <p className="crumb">
        <Link href="/jobs">Jobs</Link>
        {" / "}
        <Link href={`/assets/${job.assetId}`}>{job.asset.fileName}</Link>
      </p>
      <header className="page-head">
        <p className="eyebrow">{kind}</p>
        <h1>{job.asset.fileName}</h1>
        <p className="lede">{blurb}</p>
      </header>
      <JobPoller jobId={job.id} />
    </section>
  );
}
