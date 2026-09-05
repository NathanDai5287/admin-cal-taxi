import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/reimbursements/login-form";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/");
  }

  return (
    <div className="max-w-[440px] mx-auto py-8">
      <section className="card">
        <div className="card-header">
          <span className="card-title">Sign in</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <p className="text-[13.5px] text-muted mb-5">
            Sign in with the email and password your treasurer gave you to
            submit a reimbursement.
          </p>
          <LoginForm redirectTo="/" />
          <p className="field-hint mt-5">
            Need access? Ask your treasurer for an account.
          </p>
        </div>
      </section>
    </div>
  );
}
