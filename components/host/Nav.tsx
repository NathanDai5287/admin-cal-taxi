"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/host/pricing",  label: "Pricing"  },
  { href: "/host/contract", label: "Contract" },
  { href: "/host/invoice",  label: "Invoice"  },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-rule bg-white">
      {/* Thin brand-blue band at the very top — echoes the 1.2pt brand rule
          under the PDF letterhead. */}
      <div className="h-[3px] bg-brand" />
      <div className="max-w-[1080px] mx-auto px-6 h-[64px] flex items-center gap-5">
        <Link
          href="/"
          className="flex-none text-[12px] font-semibold text-muted hover:text-brand transition-colors"
        >
          ← Admin
        </Link>
        <span className="h-6 w-px bg-rule flex-none" aria-hidden="true" />
        <Link
          href="/host"
          className="flex items-baseline gap-3 group"
        >
          <span className="text-[14px] font-bold tracking-[0.18em] uppercase text-ink group-hover:text-brand transition-colors">
            Theta Xi
          </span>
          <span className="text-[10.5px] font-medium tracking-[0.16em] uppercase text-muted">
            Rental Tools
          </span>
        </Link>
        <nav className="ml-auto flex items-stretch h-full">
          {tabs.map(t => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "px-4 inline-flex items-center text-[12px] font-bold uppercase tracking-[0.14em] " +
                  "transition-colors border-b-2 -mb-px " +
                  (active
                    ? "text-brand border-brand"
                    : "text-muted border-transparent hover:text-ink")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
