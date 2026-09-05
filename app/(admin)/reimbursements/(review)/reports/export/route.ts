import {
  loadReportExportRows,
  parseReportFilters,
  reportRowsToCsv,
} from "@/lib/reimbursements/reports";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Route handlers are not covered by the review layout's guard.
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const filters = parseReportFilters(Object.fromEntries(url.searchParams.entries()));
  const rows = await loadReportExportRows(supabase, filters);
  const filename = `reimbursements-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(reportRowsToCsv(rows), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
