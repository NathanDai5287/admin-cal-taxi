import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { getBroadcast } from "./store";

export type BroadcastAnalytics = {
  uniqueOpens: number; uniqueClicks: number; totalOpens: number; totalClicks: number;
  recipients: { email: string; opens: number; clicks: number }[];
  pageViews: number; pageReaders: number; pdfOpens: number; pdfReaders: number; pdfDownloads: number; pdfDownloaders: number;
};

export async function loadBroadcastAnalytics(id: string): Promise<BroadcastAnalytics> {
  const row = await getBroadcast(id);
  if (!row.resend_id || row.status !== "sent") throw new Error("Activity becomes available after the broadcast is sent.");
  const resend = new Resend(process.env.RESEND_BROADCAST_API_KEY || process.env.RESEND_API_KEY);
  const recipients = new Map<string, { email: string; opens: number; clicks: number }>();
  for (const type of ["opened", "clicked"] as const) {
    let after: string | undefined;
    do {
      const result = await resend.broadcasts.recipients(row.resend_id, { type, limit: 100, ...(after ? { after } : {}) });
      if (result.error) throw new Error(`Email activity could not be loaded: ${result.error.message}`);
      for (const item of result.data.data) {
        const entry = recipients.get(item.email) ?? { email: item.email, opens: 0, clicks: 0 };
        entry[type === "opened" ? "opens" : "clicks"] = item.count ?? 0;
        recipients.set(item.email, entry);
      }
      after = result.data.has_more ? result.data.data.at(-1)?.id : undefined;
      // Keep reads below the provider's request-rate limit, including between event types.
      await new Promise((resolve) => setTimeout(resolve, 550));
    } while (after);
  }
  const { data: events, error } = await loadAllPages((from, to) => createAdminClient().from("newsletter_events")
    .select("kind,visitor_id").eq("broadcast_id", id).order("id").range(from, to));
  if (error) throw new Error("Newsletter activity could not be loaded.");
  const values = [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email));
  const matching = (kind: string) => events.filter((e) => e.kind === kind);
  return { uniqueOpens: values.filter((v) => v.opens > 0).length, uniqueClicks: values.filter((v) => v.clicks > 0).length,
    totalOpens: values.reduce((n, v) => n + v.opens, 0), totalClicks: values.reduce((n, v) => n + v.clicks, 0), recipients: values,
    pageViews: matching("page_view").length, pageReaders: new Set(matching("page_view").map((e) => e.visitor_id)).size,
    pdfOpens: matching("pdf_open").length, pdfReaders: new Set(matching("pdf_open").map((e) => e.visitor_id)).size,
    pdfDownloads: matching("pdf_download").length, pdfDownloaders: new Set(matching("pdf_download").map((e) => e.visitor_id)).size };
}
