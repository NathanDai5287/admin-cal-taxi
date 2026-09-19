import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "cal.taxi",
  description: "Theta Xi, Nu Chapter at UC Berkeley.",
};

const directionContract = `<!--
THESIS: One public crossroads gives recruitment and venue hosting equal weight; it refuses the usual single-purpose fraternity hero.
OWN-WORLD: Brand blue, cool white fields, documentary photography, sharp corners, hairline rules, and compact uppercase Inter labels define every surface.
STORY: Visitors identify Nu Chapter, see real chapter life, choose recruitment or hosting, and contact the chapter with accurate expectations.
FIRST VIEWPORT: Two equal full-height photographs flank a vertical ΘΞ divider; matched actions sit low in each image and chapter facts close the frame.
FORM: Crossroads Index, position 1 in the ordered list; seed surface-7-1-6.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <template
          data-impeccable-direction="crossroads-index"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        {children}
      </body>
    </html>
  );
}
