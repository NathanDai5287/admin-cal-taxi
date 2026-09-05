import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import Nav from "@/components/host/Nav";
import { SharedDataProvider } from "@/lib/host-shared-state";
import { getSessionProfile } from "@/lib/reimbursements/auth";

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
      <SharedDataProvider>
        <Nav />
        <main className="max-w-[1080px] mx-auto px-6 py-8">
          {session.profile.role === "admin" ? children : <AccessDenied />}
        </main>
      </SharedDataProvider>
    </div>
  );
}
