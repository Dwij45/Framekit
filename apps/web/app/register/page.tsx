import Link from "next/link";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Framekit</p>
        <h1>Create account</h1>
        <p className="lede">You will own the videos, jobs, and API keys created here.</p>
        <RegisterForm />
        <p className="muted">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
