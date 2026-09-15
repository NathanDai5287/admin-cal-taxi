"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Warms authenticated sibling routes after the current route has painted.
 * Next keeps the prefetched RSC payload in its in-memory client cache, so a
 * later tab change can reuse both the route code and its server-fetched data.
 */
export function PrefetchRoutes({ hrefs }: { hrefs: readonly string[] }) {
  const router = useRouter();
  const hrefKey = [...new Set(hrefs)].join("\n");

  useEffect(() => {
    const uniqueHrefs = hrefKey ? hrefKey.split("\n") : [];
    let cancelled = false;
    let batchHandle: number | undefined;

    const prefetch = () => {
      let index = 0;
      const warmNextBatch = () => {
        if (cancelled) return;
        for (const href of uniqueHrefs.slice(index, index + 3)) router.prefetch(href);
        index += 3;
        if (index < uniqueHrefs.length) batchHandle = window.setTimeout(warmNextBatch, 150);
      };
      warmNextBatch();
    };

    // Give the active page's requests, hydration, and first paint priority.
    // requestIdleCallback is not available in every supported browser.
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(prefetch, { timeout: 1_500 });
    } else {
      timeoutHandle = window.setTimeout(prefetch, 0);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      if (batchHandle !== undefined) window.clearTimeout(batchHandle);
    };
  }, [hrefKey, router]);

  return null;
}
