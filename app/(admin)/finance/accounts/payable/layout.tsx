import { AppAccessBoundary } from "@/components/auth/app-access-boundary";
import { requireAppAccess } from "@/lib/reimbursements/auth";

export default async function ReimbursementManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAppAccess("finance");
  return <AppAccessBoundary access={session.profile.role === "admin" ? "write" : "read"}>{children}</AppAccessBoundary>;
}
