import { NextResponse } from "next/server";
import { z } from "zod";

import { loadIssue, pdfUrl } from "@/lib/nu-news/store";
import { getSessionProfile } from "@/lib/reimbursements/auth";

// The PDF is larger than a Vercel function response may be, so the browser fetches it from Storage.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([getSessionProfile(), params]);
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const issue = z.uuid().safeParse(id).success ? await loadIssue(id) : null;
  if (!issue) return new Response("Not found", { status: 404 });

  const url = await pdfUrl(issue, 60);
  if (!url) return new Response("PDF unavailable", { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}
