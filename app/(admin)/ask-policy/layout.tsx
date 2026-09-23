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
      <AppNav
        homeHref="/ask-policy"
        title="Ask Policy"
        subtitle="Accreditation assistant"
        tabs={[
          { href: "/ask-policy", label: "Chat" },
          { href: "/ask-policy/evidence", label: "Add evidence" },
        ]}
      />
      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
