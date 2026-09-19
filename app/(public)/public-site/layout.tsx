import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import "./public-site.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Theta Xi — Nu Chapter at UC Berkeley",
    template: "%s — Theta Xi Nu Chapter",
  },
  description: "Meet Theta Xi Nu Chapter at UC Berkeley or plan an event at the chapter house.",
};

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} public-site`}>
      <a className="public-skip-link" href="#main-content">Skip to content</a>
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
