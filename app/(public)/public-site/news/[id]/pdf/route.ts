import { NextResponse } from "next/server";
import { loadPublishedIssue } from "@/lib/nu-news/publication";
import { NU_NEWS_BUCKET, pdfFileName } from "@/lib/nu-news/issue";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { trackNewsletterRequest } from "@/lib/nu-news/events";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const issue = await loadPublishedIssue((await params).id);
  if (!issue?.final_pdf_path) return new Response("Newsletter not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await createAdminClient().storage.from(NU_NEWS_BUCKET).createSignedUrl(issue.final_pdf_path, 300,
    download ? { download: pdfFileName(issue.season) } : undefined);
  if (error || !data?.signedUrl) return new Response("The newsletter PDF is temporarily unavailable. Please try again.", { status: 503 });
  const response = NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
  return request.method === "HEAD" || new URL(request.url).searchParams.get("embedded") === "1" ? response : trackNewsletterRequest(request, response, issue.id, download ? "pdf_download" : "pdf_open");
}
export const HEAD = GET;
