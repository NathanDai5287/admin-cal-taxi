import type { Metadata } from "next";

import { SetPasswordForm } from "@/components/reimbursements/set-password-form";
import { ReimbursementBrand } from "@/components/reimbursements/reimbursement-brand";
import { ThemeToggle } from "@/components/reimbursements/theme-toggle";
import { requireUser } from "@/lib/reimbursements/auth";

export const metadata: Metadata = { title: "Set password" };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  await requireUser();
  return (
    <main className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-card">
        <ReimbursementBrand href="/reimbursements/dashboard" />
        <h1>Set your password</h1>
        <p>Finish activating your invited chapter account.</p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
