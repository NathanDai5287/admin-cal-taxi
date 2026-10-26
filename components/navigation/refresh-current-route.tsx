"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Picks up externally changed records and revoked access when the person comes back to the tab.
 * It does not poll, because each refresh also drops the tabs that PrefetchRoutes warmed.
 */
export function RefreshCurrentRoute() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  return null;
}
