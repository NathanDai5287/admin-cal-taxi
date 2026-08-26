import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/reimbursements/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand" href="/reimbursements">
          <span className="brand-mark">R</span>
          <span>Chapter Reimbursements</span>
        </Link>
        <h1>Welcome back</h1>
        <p>Sign in with the email address your chapter administrator invited.</p>
        <LoginForm />
        <p className="helper-text" style={{ marginTop: 22 }}>
          Need access? Ask your chapter administrator for an invitation.
        </p>
      </section>
    </main>
  );
}
