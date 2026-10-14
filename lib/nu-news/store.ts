import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

import { NU_NEWS_BUCKET, type NuNewsIssue } from "./issue";

export type StoredIssue = NuNewsIssue & {
  id: string;
  updated_at: string;
  preview_made_at: string | null;
  finalized_at: string | null;
  finalized_by_name: string | null;
  final_pdf_path: string | null;
};

const MISSING_TABLE = "PGRST205";

export async function nuNewsIsSetUp() {
  const { error } = await createAdminClient().from("nu_news_issues").select("id").limit(0);
  if (error && error.code !== MISSING_TABLE) throw new Error(`Unable to check Nu News: ${error.message}`);
  return !error;
}

export async function loadIssue(id: string) {
  const { data, error } = await createAdminClient()
    .from("nu_news_issues")
    .select("id, season, issue_date, location, intro, articles, cover, gallery, donate, updated_at, preview_made_at, finalized_at, finalized_by_name, final_pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the Nu News issue: ${error.message}`);
  return data as StoredIssue | null;
}

export async function photoUrls(srcs: string[]): Promise<Record<string, string>> {
  if (!srcs.length) return {};
  const { data, error } = await createAdminClient().storage.from(NU_NEWS_BUCKET).createSignedUrls(srcs, 3_600);
  if (error) throw new Error(`Unable to sign Nu News photos: ${error.message}`);
  return Object.fromEntries(data.map((file) => [file.path, file.signedUrl]));
}
