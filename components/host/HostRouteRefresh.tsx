"use client";

import { usePathname } from "next/navigation";
import { RefreshCurrentRoute } from "@/components/navigation/refresh-current-route";

/** Refresh externally changed archive and inquiry data without polling the Create forms. */
export function HostRouteRefresh() {
  const pathname = usePathname();
  return pathname === "/host/inquiries" || pathname.startsWith("/host/orders")
    ? <RefreshCurrentRoute />
    : null;
}
