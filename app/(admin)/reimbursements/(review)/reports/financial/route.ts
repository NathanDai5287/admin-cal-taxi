import { getSessionProfile } from "@/lib/reimbursements/auth";
import { buildFinancialReport, type IncomeSource } from "@/lib/reimbursements/financial-report";
import { renderFinancialReportPdf } from "@/lib/reimbursements/financial-report-pdf";
import type { ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function nextDate(value: string) {
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result.toISOString();
}

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
    .select("chapter_name, term_label, term_start, term_end, opening_cash")
    .eq("id", true)
    .single();

  const now = new Date();
  const currentYear = now.getFullYear();
  const isFall = now.getMonth() >= 7;
  const settings = settingsResult.data ?? {
    chapter_name: "Theta Xi",
    term_label: `${isFall ? "Fall" : "Spring"} ${currentYear}`,
    term_start: `${currentYear}-${isFall ? "08-01" : "01-01"}`,
    term_end: `${currentYear}-${isFall ? "12-31" : "07-31"}`,
    opening_cash: 0,
  };

  const [incomeResult, budgetsResult, reimbursementsResult, manualResult, receivablesResult, liabilitiesResult] = await Promise.all([
    supabase
      .from("reimbursement_budget_entries")
      .select("source, amount")
      .gte("budget_date", settings.term_start)
      .lte("budget_date", settings.term_end),
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    supabase
      .from("reimbursements")
      .select("category, amount, reimbursed")
      .eq("status", "approved")
      .gte("submitted_at", `${settings.term_start}T00:00:00.000Z`)
      .lt("submitted_at", nextDate(settings.term_end)),
    supabase
      .from("reimbursement_manual_expenses")
      .select("category, amount")
      .gte("expense_date", settings.term_start)
      .lte("expense_date", settings.term_end),
    supabase.from("chapter_receivables").select("amount_assessed, amount_paid"),
    supabase
      .from("reimbursements")
      .select("amount")
      .eq("status", "approved")
      .eq("reimbursed", false),
  ]);

  if (reimbursementsResult.error) {
    return Response.json(
      { error: "financial_report_data_unavailable", detail: reimbursementsResult.error.message },
      { status: 500 },
    );
  }

  const categoryBudgets = Object.fromEntries((budgetsResult.data ?? []).map((row) => [
    row.budget_key,
    row.amount === null ? null : Number(row.amount),
  ]));
  const outstandingLiabilities = (liabilitiesResult.data ?? [])
    .reduce((total, row) => total + Number(row.amount), 0);

  const report = buildFinancialReport({
    chapterName: settings.chapter_name,
    termLabel: settings.term_label,
    termStart: settings.term_start,
    termEnd: settings.term_end,
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
        "Content-Disposition": `attachment; filename="${downloadName(settings.term_label)}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("Financial report PDF generation failed", error);
    return Response.json({ error: "financial_report_generation_failed" }, { status: 500 });
  }
}
