import type { Metadata } from "next";

import { MemberNavigation } from "@/components/reimbursements/member-navigation";
import { ProtectedShell } from "@/components/auth/protected-shell";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { RefreshCurrentRoute } from "@/components/navigation/refresh-current-route";

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
    <ProtectedShell>
      <div data-brand className="min-h-screen">
        {hasMemberAccess ? <RefreshCurrentRoute /> : null}
        <main className="max-w-[720px] mx-auto px-6 py-8">
          {hasMemberAccess ? <MemberNavigation showPolicy={process.env.POLICY_ASSISTANT_ENABLED === "true" && (session?.profile.role === "admin" || process.env.POLICY_ASSISTANT_MEMBERS_ENABLED === "true")} /> : null}
          {children}
        </main>
      </div>
    </ProtectedShell>
  );
}
