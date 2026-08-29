import { requireAdmin } from "@/lib/reimbursements/auth";
import {
  loadReportExportRows,
  parseReportFilters,
  reportRowsToCsv,
} from "@/lib/reimbursements/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
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
