import { headers } from "next/headers";

import { AuthPill } from "@/components/auth/auth-pill";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export async function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, headerStore] = await Promise.all([getSessionProfile(), headers()]);
  const hostname = (headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase()
    .split(":", 1)[0];
  const memberSite =
    hostname === "reimbursements.cal.taxi" || hostname === "reimbursements.localhost";
  const pillSession = session
    ? {
        fullName: session.profile.full_name,
        email: session.email,
        avatarUrl: session.avatarUrl,
        role: session.profile.role,
      }
    : null;
  const showPolicy = process.env.POLICY_ASSISTANT_ENABLED === "true" &&
    (session?.profile.role === "admin" || process.env.POLICY_ASSISTANT_MEMBERS_ENABLED === "true");

  return (
    <>
      <AuthPill memberSite={memberSite} session={pillSession} showPolicy={showPolicy} />
      {children}
    </>
  );
}
