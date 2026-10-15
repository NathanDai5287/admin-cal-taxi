import { AppAccessBoundary } from "@/components/auth/app-access-boundary";
import { notFound, redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export const metadata = { title: { default: "Accreditation", template: "%s · Accreditation" } };

export default async function AccreditationLayout({ children }: { children: React.ReactNode }) {
  if (!accreditationEnabled()) notFound();
  const session = await getSessionProfile();
  if (!session) redirect("/");
  if (!hasAppAccess(session, "accreditation")) return <AccessDenied showSubmitLink={session.profile.role === "member"} />;
  return (
    <div data-brand className="accreditation-shell min-h-screen">
      <AppNav
        homeHref="/accreditation"
        title="Theta Xi"
        subtitle="Accreditation"
        tabs={[
          { href: "/accreditation", label: "Dashboard" },
          { href: "/accreditation/library", label: "Evidence" },
          { href: "/accreditation/templates", label: "Templates" },
        ]}
      />
      <main className="max-w-[1180px] mx-auto px-6 py-8"><AppAccessBoundary access={session.appAccess.accreditation}>{children}</AppAccessBoundary></main>
    </div>
  );
}
