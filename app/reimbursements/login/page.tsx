import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/reimbursements/login-form";
import { ReimbursementBrand } from "@/components/reimbursements/reimbursement-brand";
import { ThemeToggle } from "@/components/reimbursements/theme-toggle";
import { createClient } from "@/lib/reimbursements/supabase/server";

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
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/reimbursements/dashboard");
  }

  return (
    <main className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-card">
        <ReimbursementBrand href="/reimbursements" />
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
