import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const SIGNED_URL_SECONDS = 1_200;
const CACHE_MS = 15 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;

const previewUrls = new Map<string, { url: string; expiresAt: number }>();

/** Reuse signed transforms across the payable page's frequent status refreshes. */
export async function getReceiptPreviewUrls(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const now = Date.now();
  const missingPaths = uniquePaths.filter((path) => {
    const entry = previewUrls.get(path);
    return !entry || entry.expiresAt <= now;
  });

  if (missingPaths.length) {
    const storage = createAdminClient().storage.from("receipts");
    await Promise.all(missingPaths.map(async (path) => {
      const { data } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS, {
        transform: { width: 560, quality: 72, resize: "contain" },
      });
      if (data?.signedUrl) {
        previewUrls.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_MS });
      }
    }));
  }

  if (previewUrls.size > MAX_CACHE_ENTRIES) {
    for (const [path, entry] of previewUrls) {
      if (entry.expiresAt <= now || !uniquePaths.includes(path)) previewUrls.delete(path);
      if (previewUrls.size <= MAX_CACHE_ENTRIES) break;
    }
  }

  return new Map(uniquePaths.map((path) => [path, previewUrls.get(path)?.url ?? null]));
}
