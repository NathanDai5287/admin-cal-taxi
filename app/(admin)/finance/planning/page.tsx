import Link from "next/link";
import type { Metadata } from "next";

import { ExpensePlanForm } from "@/app/(admin)/finance/planning/expense-plan-form";
import { buildPlanVsActual } from "@/lib/finance/plan-vs-actual";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryBudgetsFromRows, formatMoney } from "@/lib/reimbursements/format";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Plan vs actual" };
export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const settingsResult = await supabase.from("chapter_financial_settings")
    .select("term_label, term_start, term_end")
    .eq("id", true)
    .single();
  if (settingsResult.error) throw new Error(`Unable to load the current term: ${settingsResult.error.message}`);

  const { term_label: termLabel, term_start: termStart, term_end: termEnd } = settingsResult.data;
  const [budgetResult, incomeResult, receivablesResult, duesPaymentsResult, reimbursementsResult, expensesResult, hostingResult, hostingPaymentsResult] = await Promise.all([
    supabase.from("reimbursement_budgets").select("*"),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("kind, amount, source").gte("budget_date", termStart).lte("budget_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_receivables").select("amount_assessed, waived_at").gte("due_date", termStart).lte("due_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_dues_payment_events").select("amount, date_is_estimated").gte("paid_date", termStart).lte("paid_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursements").select("category, amount, reimbursed_at, receipt_date, submitted_at, reimbursement_date_is_estimated").eq("status", "approved").order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_manual_expenses").select("category, amount").gte("expense_date", termStart).lte("expense_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_orders").select("planned_revenue, planned_fire_permit, status").gte("event_date", termStart).lte("event_date", termEnd).order("order_id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_payments").select("amount, kind").is("reversed_at", null).gte("paid_date", termStart).lte("paid_date", termEnd).order("id").range(from, to)),
  ]);

  const failed = [budgetResult, incomeResult, receivablesResult, duesPaymentsResult, reimbursementsResult, expensesResult, hostingResult, hostingPaymentsResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Unable to load the finance plan: ${failed.error.message}`);

  const budgets = categoryBudgetsFromRows(budgetResult.data);
  // Approved reimbursements count toward actual spending whether or not the
  // chapter has paid them yet. Paid rows count by payment date; unpaid rows
  // count by the receipt (or submission) date.
  const actualReimbursements = (reimbursementsResult.data ?? []).filter((row) => {
    const activityDate = row.reimbursed_at?.slice(0, 10) ?? row.receipt_date ?? row.submitted_at.slice(0, 10);
    return activityDate >= termStart && activityDate <= termEnd;
  });
  const summary = buildPlanVsActual({
    categoryBudgets: Object.fromEntries(budgets),
    receivables: (receivablesResult.data ?? []).map((row) => ({ amountAssessed: Number(row.amount_assessed), waived: Boolean(row.waived_at) })),
    duesPayments: (duesPaymentsResult.data ?? []).map((row) => ({ amount: Number(row.amount) })),
    incomeEntries: (incomeResult.data ?? []).map((entry) => ({ amount: Number(entry.amount), kind: entry.kind, source: entry.source })),
    approvedReimbursements: actualReimbursements.map((row) => ({ category: row.category, amount: Number(row.amount) })),
    directExpenses: (expensesResult.data ?? []).map((row) => ({ category: row.category, amount: Number(row.amount) })),
    hostingOrders: (hostingResult.data ?? []).map((row) => ({ plannedRevenue: Number(row.planned_revenue), plannedFirePermit: Number(row.planned_fire_permit), status: row.status })),
    hostingPayments: (hostingPaymentsResult.data ?? []).map((row) => ({ amount: Number(row.amount), kind: row.kind })),
  });
  const estimatedActualDates = (duesPaymentsResult.data ?? []).filter((row) => row.date_is_estimated).length
    + actualReimbursements.filter((row) => row.reimbursement_date_is_estimated).length;

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Plan vs actual</h1>
          <p className="page-lede">See the term plan, current results, and the source behind every value.</p>
        </div>
        <span className="border border-rule bg-surface px-3 py-2 text-[12px] font-semibold text-muted">{termLabel}</span>
      </div>

      <section aria-label="Plan and actual totals">
        <div className="grid grid-cols-2" aria-hidden="true">
          <span className="border-t-[3px] border-brand px-4 py-2 text-xs font-bold uppercase tracking-[.13em] text-brand">Income</span>
          <span className="border-l border-t-[3px] border-brand px-4 py-2 text-xs font-bold uppercase tracking-[.13em] text-brand">Expenses</span>
        </div>
        <div className="grid grid-cols-2 border-y border-rule md:grid-cols-4">
          <Total label="Planned income" value={summary.plannedIncome} planned />
          <Total label="Actual income" value={summary.actualIncome} />
          <Total label="Planned expenses" value={summary.plannedExpenses} planned />
          <Total label="Actual expenses" value={summary.actualExpenses} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Income by source" note="Select a row to open its source page">
          {summary.incomeBreakdown.map((row) => <tr key={row.source}><td><Link className="font-semibold text-brand underline-offset-4 hover:underline" href={row.href}>{row.label} →</Link></td><td className="amount">{formatMoney(row.planned)}</td><td className="amount">{formatMoney(row.actual)}</td></tr>)}
        </Breakdown>
        <Breakdown title="Expenses by category" note="Includes approved reimbursements not yet paid">
          {summary.expenseBreakdown.map((row) => <tr key={row.category}><td><Link className="font-semibold text-brand underline-offset-4 hover:underline" href={`/finance/reports?category=${row.category}`}>{row.label} →</Link></td><td className="amount">{formatMoney(row.planned)}</td><td className="amount">{formatMoney(row.actual)}</td></tr>)}
        </Breakdown>
      </div>

      <section className="grid border border-rule bg-surface sm:grid-cols-2 lg:grid-cols-4" aria-label="Finance workflow">
        <WorkflowStep label="Add dues" href="/finance/accounts/receivable" detail="A charge adds to planned income." />
        <WorkflowStep label="Record donations" href="/finance/accounts/activity#donations" detail="Payments change actual income only." />
        <WorkflowStep label="Confirm hosting" href="/host/orders" detail="A confirmed contract adds both plans." />
        <WorkflowStep label="Review results" href="/finance/planning" detail="Open any row to inspect its records." />
      </section>

      {summary.excludedLegacyDues.length ? <p className="border border-rule bg-surface px-4 py-3 text-[12px] text-muted">{summary.excludedLegacyDues.length} legacy manual dues {summary.excludedLegacyDues.length === 1 ? "entry is" : "entries are"} visible in Account Activity and excluded here to prevent double counting.</p> : null}
      {estimatedActualDates ? <p className="border border-rule bg-surface px-4 py-3 text-xs text-muted">{estimatedActualDates} legacy {estimatedActualDates === 1 ? "payment uses" : "payments use"} the best available historical date.</p> : null}

      <section className="card" id="expense-plan">
        <div className="card-header"><span className="card-title">Expense category plan</span><span className="card-subtitle">Fire permits add to the House plan automatically.</span></div>
        <ExpensePlanForm budgets={Object.fromEntries(budgets)} />
      </section>
    </div>
  );
}

function Total({ label, value, planned = false }: { label: string; value: number; planned?: boolean }) {
  return <article className={`min-w-0 border-r border-rule p-4 last:border-r-0 md:p-5 ${planned ? "bg-brand-light text-brand" : "bg-surface"}`}><span className={`block text-xs font-bold uppercase tracking-[.1em] ${planned ? "text-brand" : "text-muted"}`}>{label}</span><strong className="mt-2 block text-[clamp(20px,3vw,30px)] font-bold tracking-[-.03em] tabular-nums">{formatMoney(value)}</strong></article>;
}

function Breakdown({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="min-w-0 border-t-[3px] border-brand bg-surface"><div className="flex flex-wrap items-baseline justify-between gap-2 border-x border-rule px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-[.1em]">{title}</h2><span className="text-xs text-muted">{note}</span></div><div className="table-scroll"><table className="data-table border border-rule"><thead><tr><th>Source</th><th className="text-right">Planned</th><th className="text-right">Actual</th></tr></thead><tbody>{children}</tbody></table></div></section>;
}

function WorkflowStep({ label, href, detail }: { label: string; href: string; detail: string }) {
  return <Link className="border-b border-rule p-4 last:border-b-0 hover:bg-brand-light sm:border-b-0 sm:border-r sm:last:border-r-0" href={href}><strong className="text-xs text-brand">{label} →</strong><span className="mt-1 block text-xs leading-relaxed text-muted">{detail}</span></Link>;
}
