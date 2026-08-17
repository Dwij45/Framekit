export default function OverviewPage() {
  return (
    <section>
      <h1>Overview</h1>
      <p className="lede">
        Phase 0 is the skeleton: login, Postgres, Redis, MinIO, and a health
        check. Encoding is not wired yet on purpose.
      </p>
      <ul className="checklist">
        <li>Auth works — you are looking at a protected page.</li>
        <li>
          Hit <code>/api/health</code> — all three boxes should be true.
        </li>
        <li>Phase 1 will add presigned upload and a 720p FFmpeg job.</li>
      </ul>
    </section>
  );
}
