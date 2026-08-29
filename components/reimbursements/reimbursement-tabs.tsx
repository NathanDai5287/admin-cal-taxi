"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ReimbursementTabsProps = {
  isAdmin: boolean;
};

const adminTabs = [
  { href: "/reimbursements/dashboard", label: "Dashboard", matches: (pathname: string) => pathname === "/reimbursements/dashboard" },
  { href: "/reimbursements/admin", label: "Admin", matches: (pathname: string) => pathname.startsWith("/reimbursements/admin") && !pathname.startsWith("/reimbursements/admin/reports") },
  { href: "/reimbursements/admin/reports", label: "Reports", matches: (pathname: string) => pathname.startsWith("/reimbursements/admin/reports") },
] as const;

export function ReimbursementTabs({ isAdmin }: ReimbursementTabsProps) {
  const pathname = usePathname();
  const tabs = isAdmin ? adminTabs : adminTabs.slice(0, 1);

  return (
    <nav aria-label="Reimbursement pages" className="app-tabs">
      {tabs.map((tab) => {
        const active = tab.matches(pathname);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`app-tab${active ? " is-active" : ""}`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
