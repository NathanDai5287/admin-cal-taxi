import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/reimbursements/login-form";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function ReimbursementsLoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/reimbursements");
  }

  return (
    <main className="max-w-[440px] mx-auto px-6 py-16">
      <section className="card">
        <div className="card-header">
          <span className="card-title">Reimbursements sign in</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <p className="text-[13.5px] text-muted mb-5">
            Review access is restricted to administrators. Sign in with your
            reimbursements account.
          </p>
          <LoginForm redirectTo="/reimbursements" />
        </div>
      </section>
    </main>
  );
}
