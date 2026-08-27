import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/reimbursements/login-form";

export const metadata: Metadata = { title: "Sign in" };

const errorMessages: Record<string, string> = {
  callback: "The sign-in link could not be verified. Ask an administrator to send a new invitation.",
  expired_invite: "This invitation has expired or was already used. Ask an administrator to send a new invitation.",
  invalid_invite: "This invitation link is incomplete. Ask an administrator to send a new invitation.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand" href="/reimbursements">
          <span className="brand-mark">R</span>
          <span>Chapter Reimbursements</span>
        </Link>
        <h1>Welcome back</h1>
        <p>Sign in with the email address your chapter administrator invited.</p>
        {error && errorMessages[error] && <p className="notice auth-error">{errorMessages[error]}</p>}
        <LoginForm />
        <p className="helper-text" style={{ marginTop: 22 }}>
          Need access? Ask your chapter administrator for an invitation.
        </p>
      </section>
    </main>
  );
}
