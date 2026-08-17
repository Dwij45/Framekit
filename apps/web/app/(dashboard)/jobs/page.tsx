import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { jobTypeLabel } from "@/lib/labels";

export default async function JobsPage() {
  const session = await auth();
  const jobs = session?.user?.id
    ? await prisma.job.findMany({
        where: { userId: session.user.id },
        include: { asset: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Studio</p>
        <h1>Jobs</h1>
        <p className="lede">
          Each job is one encode. Open a row to watch progress and play the
          result when it is ready.
        </p>
      </header>
      {jobs.length === 0 ? (
        <p className="muted">
          No jobs yet. Start from <Link href="/assets">Videos</Link>.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>File</th>
              <th>Kind</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link href={`/jobs/${job.id}`}>{job.asset.fileName}</Link>
                </td>
                <td>{jobTypeLabel(job.type)}</td>
                <td>
                  <StatusPill status={job.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
