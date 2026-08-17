export default function OverviewPage() {
  return (
    <section>
      <h1>Overview</h1>
      <p className="lede">
        Framekit is a control plane plus a worker. Next.js never encodes.
        Upload a clip on Assets and the worker will probe, transcode, and
        package HLS.
      </p>
      <ul className="checklist">
        <li>Auth works — you are looking at a protected page.</li>
        <li>
          Hit <code>/api/health</code> — all three boxes should be true.
        </li>
        <li>
          Upload on <code>/assets</code>. Playback is same-origin HLS so the
          session cookie works.
        </li>
      </ul>
    </section>
  );
}
