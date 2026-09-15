"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteHomeIcon } from "@/components/site-home-icon";

export type AppNavTab = {
  href: string;
  label: string;
};

type AppNavProps = {
  homeHref: string;
  title: string;
  subtitle?: string;
  tabs?: AppNavTab[];
  variant?: "app" | "section";
  // Optional right-side slot for app-specific actions. Account actions live
  // exclusively in the global top-right account control.
  action?: React.ReactNode;
};

export function AppNav({ homeHref, title, subtitle, tabs = [], action, variant = "app" }: AppNavProps) {
  const pathname = usePathname();

  // The longest matching tab wins, so /finance/reports lights up
  // "Reports" rather than both "Review" and "Reports".
  const activeHref = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  if (variant === "section") {
    return (
      <nav aria-label={title} className="flex gap-2 overflow-x-auto border-b border-rule pb-3">
        {tabs.map((tab) => <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === activeHref ? "page" : undefined}
          className={`whitespace-nowrap rounded px-4 py-2 text-sm font-bold ${tab.href === activeHref ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
        >{tab.label}</Link>)}
      </nav>
    );
  }

  return (
    <header className="border-b border-rule bg-surface">
      {/* Thin brand-blue band at the very top — echoes the 1.2pt brand rule
          under the PDF letterhead. */}
      <div className="h-[3px] bg-brand" />
      <div className="max-w-[1080px] mx-auto px-6 h-[64px] flex items-center gap-5">
        <SiteHomeIcon />
        <span className="h-6 w-px bg-rule flex-none" aria-hidden="true" />
        <Link href={homeHref} className="flex items-baseline gap-3 group">
          <span className="text-[14px] font-bold tracking-[0.18em] uppercase text-ink group-hover:text-brand transition-colors">
            {title}
          </span>
          {subtitle ? (
            <span className="text-[10.5px] font-medium tracking-[0.16em] uppercase text-muted">
              {subtitle}
            </span>
          ) : null}
        </Link>
        {tabs.length > 0 && (
          <nav className="ml-auto flex items-stretch h-full">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.href === activeHref ? "page" : undefined}
                className={
                  "px-4 inline-flex items-center text-[12px] font-bold uppercase tracking-[0.14em] " +
                  "transition-colors border-b-2 -mb-px " +
                  (tab.href === activeHref
                    ? "text-brand border-brand"
                    : "text-muted border-transparent hover:text-ink")
                }
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
        {action ? (
          <div className={`flex items-center ${tabs.length > 0 ? "ml-5" : "ml-auto"}`}>
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
}
