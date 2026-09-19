import { getSessionProfile } from "@/lib/reimbursements/auth";
import { buildFinancialReport, type IncomeSource } from "@/lib/reimbursements/financial-report";
import { renderFinancialReportPdf } from "@/lib/reimbursements/financial-report-pdf";
import { categoryBudgetsFromRows, type ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function downloadName(termLabel: string) {
  const term = termLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `theta-xi-financial-report-${term || "current-term"}.pdf`;
}

export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = createAdminClient();
  const settingsResult = await supabase
    .from("chapter_financial_settings")
    .select("chapter_name, opening_cash, term_label, term_start, term_end")
    .eq("id", true)
    .maybeSingle();

  if (settingsResult.error) return Response.json({ error: "financial_report_data_unavailable" }, { status: 500 });
  if (!settingsResult.data) return Response.json({ error: "financial_report_settings_unavailable" }, { status: 500 });
  const settings = settingsResult.data;

  const [incomeResult, budgetsResult, reimbursementsResult, manualResult, receivablesResult, duesPaymentsResult, liabilitiesResult, hostingPaymentsResult, hostingPlansResult] = await Promise.all([
    loadAllPages((from, to) => supabase
      .from("reimbursement_budget_entries")
      .select("source, amount, budget_date")
      .eq("kind", "income")
      .gte("budget_date", settings.term_start)
      .lte("budget_date", settings.term_end)
      .order("id").range(from, to)),
    supabase.from("reimbursement_budgets").select("*"),
    loadAllPages((from, to) => supabase
      .from("reimbursements")
      .select("category, amount, reimbursed, submitted_at")
      .eq("status", "approved")
      .eq("reimbursed", true)
      .gte("reimbursed_at", `${settings.term_start}T00:00:00.000Z`)
      .lt("reimbursed_at", nextDate(settings.term_end))
      .order("id").range(from, to)),
    loadAllPages((from, to) => supabase
      .from("reimbursement_manual_expenses")
      .select("category, amount, expense_date")
      .gte("expense_date", settings.term_start)
      .lte("expense_date", settings.term_end)
      .order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_receivables").select("id, amount_assessed, amount_paid").is("waived_at", null).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_dues_payment_events").select("amount").gte("paid_date", settings.term_start).lte("paid_date", settings.term_end).order("id").range(from, to)),
    loadAllPages((from, to) => supabase
      .from("reimbursements")
      .select("amount")
      .eq("status", "approved")
      .eq("reimbursed", false)
      .order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_payments").select("amount, kind").is("reversed_at", null).gte("paid_date", settings.term_start).lte("paid_date", settings.term_end).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_orders").select("planned_fire_permit").eq("status", "confirmed").gte("event_date", settings.term_start).lte("event_date", settings.term_end).order("order_id").range(from, to)),
  ]);

  const dataError = [incomeResult, budgetsResult, reimbursementsResult, manualResult, receivablesResult, duesPaymentsResult, liabilitiesResult, hostingPaymentsResult, hostingPlansResult].find((result) => result.error)?.error;
  if (dataError) {
    return Response.json(
      { error: "financial_report_data_unavailable", detail: dataError.message },
      { status: 500 },
    );
  }

  const categoryBudgets = Object.fromEntries(categoryBudgetsFromRows(budgetsResult.data)) as Partial<Record<ReimbursementCategory, number | null>>;
  categoryBudgets.house = Number(categoryBudgets.house ?? 0) + (hostingPlansResult.data ?? []).reduce((total, row) => total + Number(row.planned_fire_permit), 0);
  const outstandingLiabilities = (liabilitiesResult.data ?? [])
    .reduce((total, row) => total + Number(row.amount), 0);

  const receivables = receivablesResult.data ?? [];
  const hostingPayments = hostingPaymentsResult.data ?? [];
  const report = buildFinancialReport({
    chapterName: settings.chapter_name,
    termLabel: settings.term_label,
    termStart: settings.term_start,
    termEnd: settings.term_end,
    openingCash: Number(settings.opening_cash),
    generatedAt: new Date().toISOString(),
    incomeEntries: [
      ...(incomeResult.data ?? []).filter((row) => !["active_member_dues", "new_member_fees"].includes(row.source)).map((row) => ({ source: row.source as IncomeSource, amount: Number(row.amount) })),
      { source: "active_member_dues", amount: (duesPaymentsResult.data ?? []).reduce((total, row) => total + Number(row.amount), 0) },
      { source: "hosting", amount: hostingPayments.filter((row) => row.kind === "revenue").reduce((total, row) => total + Number(row.amount), 0) },
    ],
    categoryBudgets,
    reimbursements: (reimbursementsResult.data ?? []).map((row) => ({
      category: row.category,
      amount: Number(row.amount),
      reimbursed: row.reimbursed,
    })),
    manualExpenses: [
      ...(manualResult.data ?? []).map((row) => ({ category: row.category, amount: Number(row.amount) })),
      ...hostingPayments.filter((row) => row.kind === "fire_permit").map((row) => ({ category: "house" as const, amount: Number(row.amount) })),
    ],
    receivables: receivables.map((row) => ({
      amountAssessed: Number(row.amount_assessed),
      amountPaid: Number(row.amount_paid),
    })),
    outstandingLiabilities,
  });

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    return Response.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const pdf = renderFinancialReportPdf(report);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${downloadName(settings.term_label)}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("Financial report PDF generation failed", error);
    return Response.json({ error: "financial_report_generation_failed" }, { status: 500 });
  }
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
