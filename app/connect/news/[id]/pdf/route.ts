import { z } from "zod";
import { getConnectPerson } from "@/lib/alumni-connect/server";
import { loadIssue, pdfUrl } from "@/lib/nu-news/store";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const person = await getConnectPerson();
  if (!person?.canReadNews)
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  const { id } = await params;
  const issue = z.uuid().safeParse(id).success ? await loadIssue(id) : null;
  if (!issue?.finalized_at || !issue.final_pdf_path)
    return new Response("Not found", { status: 404 });
  const url = await pdfUrl(
    issue,
    60,
    new URL(request.url).searchParams.get("view") !== "1",
  );
  if (!url) return new Response("PDF unavailable", { status: 404 });
  return new Response(null, {
    status: 307,
    headers: {
      Location: url,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
