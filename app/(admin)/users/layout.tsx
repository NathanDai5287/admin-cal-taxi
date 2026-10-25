import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/");
  }

  if (!hasAppAccess(session, "users")) {
    return (
      <div data-brand className="min-h-screen">
        <AccessDenied showSubmitLink={session.profile.role === "member"} />
      </div>
    );
  }

  return (
    <div data-brand className="min-h-screen">
      <AppNav
        homeHref="/"
        title="Theta Xi"
        subtitle="Members"
        tabs={[
          { href: "/users", label: "People" },
          ...(hasAppAccess(session, "roles") ? [{ href: "/roles", label: "Roles" }] : []),
        ]}
      />
      <main className="max-w-[1440px] mx-auto px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
