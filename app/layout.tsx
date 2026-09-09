import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import { AuthPill } from "@/components/auth/auth-pill";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { THEME_COOKIE, themeInitScript } from "@/lib/theme";

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
  const [session, cookieStore] = await Promise.all([getSessionProfile(), cookies()]);
  const savedTheme = cookieStore.get(THEME_COOKIE)?.value;
  const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : undefined;
  const pillSession = session
    ? {
        fullName: session.profile.full_name,
        email: session.email,
        avatarUrl: session.avatarUrl,
        role: session.profile.role,
      }
    : null;

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <AuthPill session={pillSession} />
        {children}
      </body>
    </html>
  );
}
