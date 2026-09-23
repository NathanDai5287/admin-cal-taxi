"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PrefetchRoutes } from "@/components/navigation/prefetch-routes";

const memberRoutes = ["/", "/history"] as const;

export function MemberNavigation({ showPolicy = false }: { showPolicy?: boolean }) {
  const pathname = usePathname();
  if (pathname.includes("/login") || pathname.includes("/auth/")) return null;
  const policy = pathname === "/policy" || pathname.startsWith("/policy/");
  const history = !policy && pathname.includes("/history");
  return (
    <nav aria-label="Reimbursements" className="member-tabs">
      <PrefetchRoutes hrefs={memberRoutes.filter((href) => href !== pathname)} />
      <Link href="/" prefetch={false} aria-current={!history && !policy ? "page" : undefined}>Submit</Link>
      <Link href="/history" prefetch={false} aria-current={history ? "page" : undefined}>My requests</Link>
      {showPolicy ? <Link href="/policy" prefetch={false} aria-current={policy ? "page" : undefined}>Policy assistant</Link> : null}
    </nav>
  );
}
