import type { Metadata } from "next";

import { AppNav } from "@/components/brand/app-nav";
import { MemberNavigation } from "@/components/reimbursements/member-navigation";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const metadata: Metadata = {
  title: "Submit a reimbursement",
  description: "Submit a chapter expense for reimbursement.",
};

// Receipt OCR runs from the submission action's `after` callback and may poll
// Tabscanner for several seconds.
export const maxDuration = 60;

export default async function SubmitLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  const hasMemberAccess =
    session?.profile.role === "member" || session?.profile.role === "admin";

  return (
    <div data-brand className="min-h-screen">
      <AppNav homeHref="/" title="Theta Xi" subtitle="Reimbursements" />
      <main className="max-w-[720px] mx-auto px-6 py-8">
        {hasMemberAccess ? <MemberNavigation /> : null}
        {children}
      </main>
    </div>
  );
}
