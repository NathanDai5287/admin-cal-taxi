import { ProtectedShell } from "@/components/auth/protected-shell";

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
