"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RefreshWhile({ active, intervalMs = 5_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(interval);
  }, [active, intervalMs, router]);
  return null;
}
