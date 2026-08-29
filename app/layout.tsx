import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cal.taxi admin",
  description: "Internal admin tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
