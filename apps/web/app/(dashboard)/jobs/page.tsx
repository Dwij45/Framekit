import { prisma } from "@framekit/db";
import { auth } from "@/auth";
import Link from "next/link";

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
    <section>
      <h1>Jobs</h1>
      <p className="lede">
        A job is the worker’s to-do: probe, encode the ladder, package HLS.
      </p>
      {jobs.length === 0 ? (
        <p className="muted">
          No jobs yet. Upload from <Link href="/assets">Assets</Link>.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link href={`/jobs/${job.id}`}>{job.asset.fileName}</Link>
                </td>
                <td>{job.status}</td>
                <td>{job.progressStage ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
