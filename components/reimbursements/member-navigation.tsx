"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MemberNavigation() {
  const pathname = usePathname();
  if (pathname.includes("/login") || pathname.includes("/auth/")) return null;
  const history = pathname.includes("/history");
  return (
    <nav aria-label="Reimbursements" className="mb-6 flex flex-wrap gap-2 border-b border-rule pb-3">
      <Link href="/" aria-current={!history ? "page" : undefined} className={`rounded px-3 py-2 text-sm ${!history ? "bg-brand text-white" : "text-muted"}`}>Submit reimbursement</Link>
      <Link href="/history" aria-current={history ? "page" : undefined} className={`rounded px-3 py-2 text-sm ${history ? "bg-brand text-white" : "text-muted"}`}>My reimbursements</Link>
    </nav>
  );
}
