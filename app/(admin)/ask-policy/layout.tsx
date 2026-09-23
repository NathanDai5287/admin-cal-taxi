import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import "./ask-policy.css";

export const metadata = { title: { default: "Ask Policy", template: "%s · Ask Policy" } };

export default async function AskPolicyLayout({ children }: { children: React.ReactNode }) {
  if (!accreditationEnabled()) notFound();
  const session = await getSessionProfile();
  if (!session) redirect("/");
  if (session.profile.role !== "admin") return <AccessDenied showSubmitLink={session.profile.role === "member"} />;

  return (
    <div data-brand className="ask-policy-shell min-h-screen bg-page">
      <header className="bg-surface">
        <div className="mx-auto flex min-h-[72px] max-w-[1500px] items-center px-4 py-3 pr-[180px] sm:px-6 sm:pr-[210px]">
          <Link href="/" className="flex w-fit items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-base font-bold text-white" aria-hidden="true">A</span>
            <span className="min-w-0"><span className="block text-sm font-semibold leading-tight text-ink">Ask Policy</span><span className="hidden text-xs text-muted sm:block">Accreditation assistant</span></span>
          </Link>
        </div>
      </header>
      <div className="bg-surface">
        <div className="ask-policy-tabs mx-auto max-w-[1500px] px-3 sm:px-6">
          <AppNav
            variant="section"
            homeHref="/ask-policy"
            title="Ask Policy"
            tabs={[
              { href: "/ask-policy", label: "Chat" },
              { href: "/ask-policy/evidence", label: "Add evidence" },
            ]}
          />
        </div>
      </div>
      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
