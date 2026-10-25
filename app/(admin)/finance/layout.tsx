import { AppAccessBoundary } from "@/components/auth/app-access-boundary";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";
import { RefreshCurrentRoute } from "@/components/navigation/refresh-current-route";

export const metadata = { title: { default: "Finance", template: "%s · Finance" } };

// Every page in this group requires a signed-in administrator. Members and
// uninvited accounts see an access-denied card with a link to the submit site.
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/reimbursements/login");
  }

  if (!hasAppAccess(session, "finance")) {
    return <AccessDenied showSubmitLink />;
  }

  const access = session.appAccess.finance;
  const readOnly = access !== "write";
  return (
    <div data-brand className="min-h-screen">
      <RefreshCurrentRoute />
      <AppNav
        homeHref="/finance/planning"
        title="Theta Xi"
        subtitle="Finance"
        prefetchTabContent
        tabs={[
          { href: "/finance/planning", label: "Planning" },
          { href: "/finance/accounts/receivable", label: "Dues" },
          { href: "/finance/accounts/payable", label: "Reimbursements" },
          ...(readOnly ? [] : [{ href: "/finance/accounts/activity", label: "Transactions" }]),
        ]}
      />
      <main className="finance-main max-w-[1080px] mx-auto px-6 py-8"><AppAccessBoundary access={access}>{children}</AppAccessBoundary></main>
    </div>
  );
}
