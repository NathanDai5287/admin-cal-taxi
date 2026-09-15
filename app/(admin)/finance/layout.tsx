import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const metadata = { title: { default: "Finance", template: "%s · Finance" } };

// Every page in this group requires a signed-in administrator. Members and
// uninvited accounts see an access-denied card with a link to the submit site.
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/reimbursements/login");
  }

  if (session.profile.role !== "admin") {
    return <AccessDenied showSubmitLink />;
  }

  return (
    <div data-brand className="min-h-screen">
      <AppNav
        homeHref="/finance/accounts"
        title="Theta Xi"
        subtitle="Finance"
        tabs={[
          { href: "/finance/accounts", label: "Accounts" },
          { href: "/finance/planning", label: "Planning" },
          { href: "/finance/review", label: "Review" },
          { href: "/finance/reports", label: "Reports" },
        ]}
      />
      <main className="max-w-[1080px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
