import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
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
        homeHref="/"
        title="Theta Xi"
        subtitle="Admin"
        tabs={[{ href: "/users", label: "Members" }]}
      />
      <main className="max-w-[1080px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
