import { NextResponse } from "next/server";
import { loadPublishedIssue } from "@/lib/nu-news/publication";
import { trackNewsletterRequest } from "@/lib/nu-news/events";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const issue = await loadPublishedIssue((await params).id);
  if (!issue) return new Response("Newsletter not found", { status: 404 });
  return trackNewsletterRequest(request, new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } }), issue.id, "page_view");
}
