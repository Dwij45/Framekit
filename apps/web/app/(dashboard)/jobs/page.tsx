export default function JobsPage() {
  return (
    <section>
      <h1>Jobs</h1>
      <p className="lede">
        A job is a row that moves queued → probing → encoding → ready. The
        worker will own that state machine in Phase 1.
      </p>
    </section>
  );
}
