import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { SignOutButton } from "@/components/reimbursements/sign-out-button";
import { getSessionProfile } from "@/lib/reimbursements/auth";

// Every page in this group requires a signed-in administrator. Members and
// uninvited accounts see an access-denied card with a link to the submit site.
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/reimbursements/login");
  }

  if (session.profile.role !== "admin") {
    return <AccessDenied showSubmitLink />;
  }

  return (
    <>
      <AppNav
        homeHref="/reimbursements"
        title="Theta Xi"
        subtitle="Reimbursements"
        tabs={[
          { href: "/reimbursements", label: "Review" },
          { href: "/reimbursements/reports", label: "Reports" },
        ]}
        action={<SignOutButton action="/reimbursements/auth/signout" />}
      />
      <main className="max-w-[1080px] mx-auto px-6 py-8">{children}</main>
    </>
  );
}
