import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const COOKIE = "nu_news_visitor";
export async function trackNewsletterRequest(request: Request, response: NextResponse, issueId: string, kind: "page_view" | "pdf_open" | "pdf_download") {
  const req = new NextRequest(request);
  const supplied = req.cookies.get(COOKIE)?.value;
  const visitorId = z.uuid().safeParse(supplied).success ? supplied! : randomUUID();
  const source = new URL(request.url).searchParams.get("broadcast");
  let broadcastId: string | null = null;
  if (z.uuid().safeParse(source).success) {
    const { data } = await createAdminClient().from("mailing_broadcasts").select("id").eq("id", source!).eq("newsletter_id", issueId).eq("status", "sent").maybeSingle();
    broadcastId = data?.id ?? null;
  }
  try {
    // Analytics failure must never prevent someone from reading the newsletter.
    await createAdminClient().from("newsletter_events").insert({ issue_id: issueId, broadcast_id: broadcastId, kind, visitor_id: visitorId });
  } catch { /* Reading remains available during a database interruption. */ }
  response.cookies.set(COOKIE, visitorId, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 60 * 60 * 24 * 90, path: "/" });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
