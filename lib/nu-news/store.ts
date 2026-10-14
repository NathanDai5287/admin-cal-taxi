import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

import { NU_NEWS_BUCKET, pdfFileName, previewPath, type NuNewsIssue } from "./issue";

export type StoredIssue = NuNewsIssue & {
  id: string;
  updated_at: string;
  preview_made_at: string | null;
  finalized_at: string | null;
  finalized_by_name: string | null;
  final_pdf_path: string | null;
  final_pdf_sha256: string | null;
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
    .select("id, season, issue_date, location, intro, articles, cover, gallery, donate, updated_at, preview_made_at, finalized_at, finalized_by_name, final_pdf_path, final_pdf_sha256")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the Nu News issue: ${error.message}`);
  return data as StoredIssue | null;
}

export async function listIssues() {
  const { data, error } = await createAdminClient()
    .from("nu_news_issues")
    .select("id, season, issue_date, preview_made_at, finalized_at, finalized_by_name")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load Nu News issues: ${error.message}`);
  return data;
}

export async function pdfUrl(issue: StoredIssue, expiresInSeconds: number) {
  const storage = createAdminClient().storage.from(NU_NEWS_BUCKET);
  const { data } = issue.final_pdf_path
    ? await storage.createSignedUrl(issue.final_pdf_path, expiresInSeconds, { download: pdfFileName(issue.season) })
    : await storage.createSignedUrl(previewPath(issue.id), expiresInSeconds);
  return data?.signedUrl ?? null;
}

export async function photoUrls(srcs: string[], expiresInSeconds: number): Promise<Record<string, string>> {
  if (!srcs.length) return {};
  const { data, error } = await createAdminClient().storage.from(NU_NEWS_BUCKET).createSignedUrls(srcs, expiresInSeconds);
  if (error) throw new Error(`Unable to sign Nu News photos: ${error.message}`);
  return Object.fromEntries(data.map((file) => [file.path, file.signedUrl]));
}
