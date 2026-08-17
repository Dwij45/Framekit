import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Framekit</p>
        <h1>Sign in</h1>
        <p className="lede">
          Phase 0: accounts only. Video upload lands in Phase 1.
        </p>
        <Suspense fallback={<p className="muted">Loading form…</p>}>
          <LoginForm />
        </Suspense>
        <p className="muted">
          No account? <Link href="/register">Create one</Link>
        </p>
      </div>
    </main>
  );
}
