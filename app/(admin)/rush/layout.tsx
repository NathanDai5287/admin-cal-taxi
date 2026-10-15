import { AppAccessBoundary } from "@/components/auth/app-access-boundary";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export default async function RushLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/");
  }

  if (!hasAppAccess(session, "rush")) {
    return (
      <div data-brand className="min-h-screen">
        <AccessDenied showSubmitLink={session.profile.role === "member"} />
      </div>
    );
  }

  return <div data-brand className="min-h-screen"><AppAccessBoundary access={session.appAccess["rush"]}>{children}</AppAccessBoundary></div>;
}
