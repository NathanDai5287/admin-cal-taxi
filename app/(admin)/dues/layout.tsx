import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export default async function DuesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/");
  }

  if (session.profile.role !== "admin") {
    return (
      <div data-brand className="min-h-screen">
        <AccessDenied showSubmitLink={session.profile.role === "member"} />
      </div>
    );
  }

  return (
    <div data-brand className="min-h-screen">
      <AppNav
        homeHref="/dues"
        title="Theta Xi"
        subtitle="Dues Tracker"
        tabs={[{ href: "/dues", label: "Balances" }]}
      />
      <main className="mx-auto max-w-[1180px] px-6 py-8">{children}</main>
    </div>
  );
}
