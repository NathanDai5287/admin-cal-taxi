import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function safeNext(value: string | string[] | undefined) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/finance";
}

export default async function ReimbursementsLoginPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const session = await getSessionProfile();
  if (session) {
    redirect(next);
  }

  const authFailed = params.error === "auth";

  return (
    <main className="max-w-[440px] mx-auto px-6 py-16">
      <section className="card">
        <div className="card-header">
          <span className="card-title">Sign in</span>
          <span className="card-subtitle">Chapter finances</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          {authFailed ? (
            <p className="form-message mb-5">Sign-in failed. Please try again.</p>
          ) : null}
          <GoogleSignInButton next={next} />
        </div>
      </section>
    </main>
  );
}
