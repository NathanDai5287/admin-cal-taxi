import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export default async function RushLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return <div data-brand className="min-h-screen">{children}</div>;
}
