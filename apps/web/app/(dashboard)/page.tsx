import Link from "next/link";
import { prisma } from "@framekit/db";
import { usageCapMs, usageMonthKey } from "@framekit/shared";
import { auth } from "@/auth";

export default async function OverviewPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const yyyymm = usageMonthKey();
  const [usage, readyCount, activeJob] = userId
    ? await Promise.all([
        prisma.usageMonth.findUnique({
          where: { userId_yyyymm: { userId, yyyymm } },
        }),
        prisma.asset.count({ where: { userId, status: "ready" } }),
        prisma.job.findFirst({
          where: {
            userId,
            status: { in: ["queued", "probing", "encoding", "packaging"] },
          },
          orderBy: { createdAt: "desc" },
          include: { asset: true },
        }),
      ])
    : [null, 0, null];

  const encodedMin = Math.round(((usage?.encodedMs ?? 0) / 60000) * 100) / 100;
  const capMin = usageCapMs() / 60000;
  const pct = capMin > 0 ? Math.min(100, Math.round((encodedMin / capMin) * 100)) : 0;

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Studio</p>
        <h1>Upload a video. We encode it. You play it.</h1>
        <p className="lede">
          Framekit is a small video platform: your file goes to object storage,
          a worker transcodes it, then you stream HLS. This screen is only the
          map — pick a step.
        </p>
      </header>

      {activeJob ? (
        <p className="banner">
          Encoding <strong>{activeJob.asset.fileName}</strong> —{" "}
          <Link href={`/jobs/${activeJob.id}`}>watch progress</Link>
        </p>
      ) : null}

      <ol className="steps">
        <li>
          <p className="step-kicker">1</p>
          <div>
            <h2>
              <Link href="/assets">Add a video</Link>
            </h2>
            <p>MP4, MOV, WebM, or MKV. The file never passes through the encoder in the browser.</p>
          </div>
        </li>
        <li>
          <p className="step-kicker">2</p>
          <div>
            <h2>
              <Link href="/jobs">Wait for the job</Link>
            </h2>
            <p>Inspect → encode 360/720/1080 (never bigger than the source) → package HLS.</p>
          </div>
        </li>
        <li>
          <p className="step-kicker">3</p>
          <div>
            <h2>
              {readyCount > 0 ? <Link href="/assets">Play, then make a cut</Link> : "Play, then make a cut"}
            </h2>
            <p>
              Open a ready video to play it. <strong>Make a new version</strong> crops or
              mutes. <Link href="/renders">Timeline</Link> stitches clips together.
            </p>
          </div>
        </li>
      </ol>

      <div className="stat-row">
        <div className="stat">
          <p className="stat-label">Ready videos</p>
          <p className="stat-value">{readyCount}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Encoded this month</p>
          <p className="stat-value">
            {encodedMin}
            <span className="stat-unit"> / {capMin} min</span>
          </p>
          <div className="meter" aria-label="usage">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <section className="next-block">
        <h2>What to do next</h2>
        <p>
          The product loop works on your machine (phases 0–4). The next build
          step is a <strong>public URL</strong>: Postgres, Redis, and object
          storage in the cloud, worker on Fly or Cloud Run, this dashboard on
          Vercel. Until then, use <Link href="/docs">the guide</Link> if a
          page looks unfamiliar.
        </p>
      </section>
    </section>
  );
}
