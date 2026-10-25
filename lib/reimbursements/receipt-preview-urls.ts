import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const SIGNED_URL_SECONDS = 1_200;
const CACHE_MS = 15 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;
const RECEIPT_SIZES = {
  preview: { width: 560, quality: 72 },
  full: { width: 2000, quality: 85 },
};

const previewUrls = new Map<string, { url: string; expiresAt: number }>();

/** Reuse signed transforms across the payable page's frequent status refreshes. */
export async function getReceiptPreviewUrls(paths: string[], size: keyof typeof RECEIPT_SIZES = "preview") {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const now = Date.now();
  const missingPaths = uniquePaths.filter((path) => {
    const entry = previewUrls.get(`${size}:${path}`);
    return !entry || entry.expiresAt <= now;
  });

  if (missingPaths.length) {
    const storage = createAdminClient().storage.from("receipts");
    await Promise.all(missingPaths.map(async (path) => {
      const { data } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS, {
        transform: { ...RECEIPT_SIZES[size], resize: "contain" },
      });
      if (data?.signedUrl) {
        previewUrls.set(`${size}:${path}`, { url: data.signedUrl, expiresAt: Date.now() + CACHE_MS });
      }
    }));
  }

  if (previewUrls.size > MAX_CACHE_ENTRIES) {
    for (const [path, entry] of previewUrls) {
      if (entry.expiresAt <= now || !uniquePaths.some((current) => path.endsWith(`:${current}`))) previewUrls.delete(path);
      if (previewUrls.size <= MAX_CACHE_ENTRIES) break;
    }
  }

  return new Map(uniquePaths.map((path) => [path, previewUrls.get(`${size}:${path}`)?.url ?? null]));
}
