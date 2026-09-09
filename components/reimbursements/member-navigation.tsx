"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MemberNavigation() {
  const pathname = usePathname();
  if (pathname.includes("/login") || pathname.includes("/auth/")) return null;
  const history = pathname.includes("/history");
  return (
    <nav aria-label="Reimbursements" className="member-tabs">
      <Link href="/" aria-current={!history ? "page" : undefined}>Submit reimbursement</Link>
      <Link href="/history" aria-current={history ? "page" : undefined}>My reimbursements</Link>
    </nav>
  );
}
