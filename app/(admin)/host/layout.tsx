import { AppAccessBoundary } from "@/components/auth/app-access-boundary";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import Nav from "@/components/host/Nav";
import { HostRouteRefresh } from "@/components/host/HostRouteRefresh";
import { HostWorkspaceBoundary } from "@/lib/host-shared-state";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export const metadata: Metadata = {
  title: "Host — cal.taxi admin",
  description: "Generate contracts, price estimates, and invoices for Theta Xi Fraternity rentals.",
};

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/");
  }

  return (
    <div data-brand>
      <HostRouteRefresh />
      <HostWorkspaceBoundary>
        <Nav />
        <main className="max-w-[1080px] mx-auto px-6 py-8">
          {hasAppAccess(session, "host") ? (
            <AppAccessBoundary access={session.appAccess.host}>{children}</AppAccessBoundary>
          ) : (
            <AccessDenied showSubmitLink={session.profile.role === "member"} />
          )}
        </main>
      </HostWorkspaceBoundary>
    </div>
  );
}
