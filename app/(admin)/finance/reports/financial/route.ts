import { getSessionProfile } from "@/lib/reimbursements/auth";
import { buildFinancialReport, type IncomeSource } from "@/lib/reimbursements/financial-report";
import { renderFinancialReportPdf } from "@/lib/reimbursements/financial-report-pdf";
import type { ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

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
    .select("chapter_name, opening_cash")
    .eq("id", true)
    .maybeSingle();

  if (settingsResult.error) return Response.json({ error: "financial_report_data_unavailable" }, { status: 500 });
  const settings = settingsResult.data ?? { chapter_name: "Theta Xi", opening_cash: 0 };

  const [incomeResult, budgetsResult, reimbursementsResult, manualResult, receivablesResult, liabilitiesResult] = await Promise.all([
    supabase
      .from("reimbursement_budget_entries")
      .select("source, amount, budget_date")
      .eq("kind", "income"),
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    supabase
      .from("reimbursements")
      .select("category, amount, reimbursed, submitted_at")
      .eq("status", "approved"),
    supabase
      .from("reimbursement_manual_expenses")
      .select("category, amount, expense_date"),
    supabase.from("chapter_receivables").select("amount_assessed, amount_paid"),
    supabase
      .from("reimbursements")
      .select("amount")
      .eq("status", "approved")
      .eq("reimbursed", false),
  ]);

  const dataError = [incomeResult, budgetsResult, reimbursementsResult, manualResult, receivablesResult, liabilitiesResult].find((result) => result.error)?.error;
  if (dataError) {
    return Response.json(
      { error: "financial_report_data_unavailable", detail: dataError.message },
      { status: 500 },
    );
  }

  const categoryBudgets = Object.fromEntries((budgetsResult.data ?? []).map((row) => [
    row.budget_key,
    row.amount === null ? null : Number(row.amount),
  ]));
  const outstandingLiabilities = (liabilitiesResult.data ?? [])
    .reduce((total, row) => total + Number(row.amount), 0);

  // Until term management exists, all recorded activity belongs to the current term.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dates = [today, ...(incomeResult.data ?? []).map((row) => row.budget_date),
    ...(manualResult.data ?? []).map((row) => row.expense_date),
    ...(reimbursementsResult.data ?? []).map((row) => row.submitted_at.slice(0, 10))].sort();
  const report = buildFinancialReport({
    chapterName: settings.chapter_name,
    termLabel: "Current term",
    termStart: dates[0],
    termEnd: dates[dates.length - 1],
    openingCash: Number(settings.opening_cash),
    generatedAt: new Date().toISOString(),
    incomeEntries: (incomeResult.data ?? []).map((row) => ({
      source: row.source as IncomeSource,
      amount: Number(row.amount),
    })),
    categoryBudgets: categoryBudgets as Partial<Record<ReimbursementCategory, number | null>>,
    reimbursements: (reimbursementsResult.data ?? []).map((row) => ({
      category: row.category,
      amount: Number(row.amount),
      reimbursed: row.reimbursed,
    })),
    manualExpenses: (manualResult.data ?? []).map((row) => ({
      category: row.category,
      amount: Number(row.amount),
    })),
    receivables: (receivablesResult.data ?? []).map((row) => ({
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
        "Content-Disposition": `attachment; filename="${downloadName("current-term")}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("Financial report PDF generation failed", error);
    return Response.json({ error: "financial_report_generation_failed" }, { status: 500 });
  }
}
