import { ProtectedShell } from "@/components/auth/protected-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
