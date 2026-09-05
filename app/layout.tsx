import type { Metadata } from "next";
import "./globals.css";

import { AuthPill } from "@/components/auth/auth-pill";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "cal.taxi admin",
  description: "Internal admin tools",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionProfile();
  const pillSession = session
    ? {
        fullName: session.profile.full_name,
        email: session.email,
        avatarUrl: session.avatarUrl,
        role: session.profile.role,
      }
    : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthPill session={pillSession} />
        {children}
      </body>
    </html>
  );
}
