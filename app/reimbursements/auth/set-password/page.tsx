import type { Metadata } from "next";

import { SetPasswordForm } from "@/components/reimbursements/set-password-form";
import { requireUser } from "@/lib/reimbursements/auth";

export const metadata: Metadata = { title: "Set password" };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  await requireUser();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand"><span className="brand-mark">R</span><span>Chapter Reimbursements</span></span>
        <h1>Set your password</h1>
        <p>Finish activating your invited chapter account.</p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
