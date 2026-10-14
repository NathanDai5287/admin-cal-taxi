import { NextResponse } from "next/server";
import { z } from "zod";

import { NU_NEWS_BUCKET, pdfFileName, previewPath } from "@/lib/nu-news/issue";
import { loadIssue } from "@/lib/nu-news/store";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

// The PDF is larger than a Vercel function response may be, so the browser fetches it from Storage.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([getSessionProfile(), params]);
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const issue = z.uuid().safeParse(id).success ? await loadIssue(id) : null;
  if (!issue) return new Response("Not found", { status: 404 });

  const storage = createAdminClient().storage.from(NU_NEWS_BUCKET);
  const { data } = issue.final_pdf_path
    ? await storage.createSignedUrl(issue.final_pdf_path, 60, { download: pdfFileName(issue.season) })
    : await storage.createSignedUrl(previewPath(issue.id), 60);
  if (!data?.signedUrl) return new Response("PDF unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
