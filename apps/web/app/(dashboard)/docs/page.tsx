import Link from "next/link";

export default function DocsPage() {
  return (
    <section className="page docs">
      <header className="page-head">
        <p className="eyebrow">Help</p>
        <h1>How Framekit works</h1>
        <p className="lede">
          You upload a video. A background worker encodes it. You play it, or
          you ask for a new cut. This page is the product guide — not the
          engineering spec.
        </p>
      </header>

      <h2>Start here</h2>
      <ol className="guide-ol">
        <li>
          <Link href="/assets">Videos</Link> — upload an MP4 (or MOV / WebM / MKV).
        </li>
        <li>
          You are sent to a <Link href="/jobs">job</Link>. Wait until status is Ready, then press play.
        </li>
        <li>
          Open the video. <strong>Make a new version</strong> is for one file (crop, mute, logo).
        </li>
        <li>
          <Link href="/renders">Timeline</Link> is for stitching several clips into one file.
        </li>
      </ol>

      <h2>The three job kinds</h2>
      <table className="data">
        <thead>
          <tr>
            <th>Kind</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Upload</td>
            <td>Probe the file, encode 360p / 720p / 1080p without upscaling, package HLS.</td>
          </tr>
          <tr>
            <td>Edit</td>
            <td>New file from one source: aspect, speed, mute, logo. Original stays.</td>
          </tr>
          <tr>
            <td>Timeline</td>
            <td>Concat clips you list in JSON (trim, mute, logo). Asset IDs must be yours and ready.</td>
          </tr>
        </tbody>
      </table>

      <h2>Why the browser does not encode</h2>
      <p>
        Next.js is the control plane: login, presigned upload, job status.
        FFmpeg runs only in <code>apps/worker</code>. That split is what lets
        the dashboard go to Vercel later while the worker stays on a real VM.
      </p>

      <h2>API (for curl)</h2>
      <p>
        Create a key under <Link href="/api-keys">API keys</Link>, then:
      </p>
      <pre>{`curl -H "Authorization: Bearer fk_test_…" \\
  http://localhost:3000/api/v1/jobs`}</pre>
      <p>
        Job-creating POSTs accept <code>Idempotency-Key</code>. Same key + same
        body returns the same job instead of encoding twice.
      </p>
      <p>
        <Link href="/webhooks">Webhooks</Link> receive JSON{" "}
        <code>event</code>, <code>job_id</code>, <code>asset_id</code>,{" "}
        <code>status</code> with header <code>X-Framekit-Signature</code>.
      </p>

      <h2>What’s next</h2>
      <p>
        Phases 0–4 are done on this machine. The next step in the build is a{" "}
        <strong>public deploy</strong>: managed Postgres, Redis, R2, worker on
        Fly or Cloud Run, this app on Vercel. Done when someone can upload from
        a phone on your URL.
      </p>
      <p className="muted">
        Longer write-ups: <code>docs/USER_GUIDE.md</code>,{" "}
        <code>docs/COMPLETE_GUIDE.md</code>.
      </p>
    </section>
  );
}
