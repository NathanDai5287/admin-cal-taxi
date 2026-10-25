import Link from "next/link";

import { CategoryMenu } from "@/app/(admin)/finance/planning/plan-editors";
import { buildPlanVsActual } from "@/lib/finance/plan-vs-actual";
import { categoryBudgetsFromRows, formatMoney, type ReimbursementCategory } from "@/lib/reimbursements/format";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

type SpendingItem = { category: ReimbursementCategory; id: string; receipt: boolean; description: string; amount: number; date: string };

async function loadPlanVsActual() {
  const supabase = createAdminClient();
  const settingsResult = await supabase.from("chapter_financial_settings")
    .select("term_label, term_start, term_end, academic_terms(label, starts_on, ends_on)")
    .eq("id", true)
    .single();
  if (settingsResult.error) throw new Error(`Unable to load the current term: ${settingsResult.error.message}`);

  const academicTerm = Array.isArray(settingsResult.data.academic_terms)
    ? settingsResult.data.academic_terms[0]
    : settingsResult.data.academic_terms;
  const termLabel = academicTerm?.label ?? settingsResult.data.term_label;
  const termStart = academicTerm?.starts_on ?? settingsResult.data.term_start;
  const termEnd = academicTerm?.ends_on ?? settingsResult.data.term_end;
  const [budgetResult, incomeResult, receivablesResult, duesPaymentsResult, reimbursementsResult, expensesResult, hostingResult, hostingPaymentsResult] = await Promise.all([
    supabase.from("reimbursement_budgets").select("*"),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("kind, amount, source").gte("budget_date", termStart).lte("budget_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_receivables").select("amount_assessed, waived_at").gte("due_date", termStart).lte("due_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("chapter_dues_payment_events").select("amount").gte("paid_date", termStart).lte("paid_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursements").select("id, category, amount, description, reimbursed_at, receipt_date, submitted_at").eq("status", "approved").order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_manual_expenses").select("id, category, amount, description, expense_date").gte("expense_date", termStart).lte("expense_date", termEnd).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_orders").select("planned_revenue, planned_fire_permit, status").gte("event_date", termStart).lte("event_date", termEnd).order("order_id").range(from, to)),
    loadAllPages((from, to) => supabase.from("hosting_finance_payments").select("amount, kind").is("reversed_at", null).gte("paid_date", termStart).lte("paid_date", termEnd).order("id").range(from, to)),
  ]);

  const failed = [budgetResult, incomeResult, receivablesResult, duesPaymentsResult, reimbursementsResult, expensesResult, hostingResult, hostingPaymentsResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Unable to load the finance plan: ${failed.error.message}`);

  const budgets = categoryBudgetsFromRows(budgetResult.data);
  const completedCategories = budgetResult.data?.[0]?.completed_categories ?? [];
  // Approved reimbursements count toward actual spending whether or not the
  // chapter has paid them yet. Paid rows count by payment date; unpaid rows
  // count by the receipt (or submission) date.
  const actualReimbursements = (reimbursementsResult.data ?? []).filter((row) => {
    const activityDate = row.reimbursed_at?.slice(0, 10) ?? row.receipt_date ?? row.submitted_at.slice(0, 10);
    return activityDate >= termStart && activityDate <= termEnd;
  });
  const directExpenses = expensesResult.data ?? [];
  const summary = buildPlanVsActual({
    categoryBudgets: Object.fromEntries(budgets),
    completedCategories,
    receivables: (receivablesResult.data ?? []).map((row) => ({ amountAssessed: Number(row.amount_assessed), waived: Boolean(row.waived_at) })),
    duesPayments: (duesPaymentsResult.data ?? []).map((row) => ({ amount: Number(row.amount) })),
    incomeEntries: (incomeResult.data ?? []).map((entry) => ({ amount: Number(entry.amount), kind: entry.kind, source: entry.source })),
    approvedReimbursements: actualReimbursements.map((row) => ({ category: row.category, amount: Number(row.amount) })),
    directExpenses: directExpenses.map((row) => ({ category: row.category, amount: Number(row.amount) })),
    hostingOrders: (hostingResult.data ?? []).map((row) => ({ plannedRevenue: Number(row.planned_revenue), plannedFirePermit: Number(row.planned_fire_permit), status: row.status })),
    hostingPayments: (hostingPaymentsResult.data ?? []).map((row) => ({ amount: Number(row.amount), kind: row.kind })),
  });
  const items: SpendingItem[] = [
    ...actualReimbursements.map((row) => ({ category: row.category, id: row.id, receipt: true, description: row.description, amount: Number(row.amount), date: row.receipt_date ?? row.submitted_at.slice(0, 10) })),
    ...directExpenses.map((row) => ({ category: row.category, id: row.id, receipt: false, description: row.description, amount: Number(row.amount), date: row.expense_date })),
  ].sort((left, right) => right.date.localeCompare(left.date));

  return { termLabel, summary, budgets, completedCategories, items };
}

export async function PlanVsActual({ editable = false }: { editable?: boolean }) {
  const { termLabel, summary, budgets, completedCategories, items } = await loadPlanVsActual();

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
        <Breakdown title="Income by source" note="Bars fill toward the plan; green means the plan was exceeded">
          {summary.incomeBreakdown.map((row) => (
            <PlanBarRow
              actual={row.actual}
              hasPlan={row.planned > 0}
              href={editable ? row.href : undefined}
              key={row.source}
              kind="income"
              label={row.label}
              planned={formatMoney(row.planned)}
              plannedAmount={row.planned}
            />
          ))}
        </Breakdown>
        <Breakdown title="Expenses by category" note="Includes approved reimbursements not yet paid">
          {summary.expenseBreakdown.map((row) => {
            const categoryItems = items.filter((item) => item.category === row.category);
            const completed = completedCategories.includes(row.category);
            return (
              <PlanBarRow
                actual={row.actual}
                hasPlan={row.planned > 0 || budgets.get(row.category) != null}
                key={row.category}
                kind="expense"
                label={row.label}
                planned={formatMoney(row.planned)}
                completed={completed}
                plannedAmount={row.planned}
                control={editable ? <CategoryMenu category={row.category} label={row.label} budget={budgets.get(row.category) ?? null} completed={completed} /> : null}
              >
                <SpendingItems items={categoryItems} />
              </PlanBarRow>
            );
          })}
        </Breakdown>
      </div>

      {editable && summary.excludedLegacyDues.length ? <p className="border border-rule bg-surface px-4 py-3 text-[12px] text-muted">{summary.excludedLegacyDues.length} legacy manual dues {summary.excludedLegacyDues.length === 1 ? "entry is" : "entries are"} visible in Account Activity and excluded here to prevent double counting.</p> : null}
    </div>
  );
}

function Total({ label, value, planned = false }: { label: string; value: number; planned?: boolean }) {
  return <article className={`min-w-0 border-r border-rule p-4 last:border-r-0 md:p-5 ${planned ? "bg-brand-light text-brand" : "bg-surface"}`}><span className={`block text-xs font-bold uppercase tracking-[.1em] ${planned ? "text-brand" : "text-muted"}`}>{label}</span><strong className="mt-2 block text-[clamp(20px,3vw,30px)] font-bold tracking-[-.03em] tabular-nums">{formatMoney(value)}</strong></article>;
}

function Breakdown({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="min-w-0 self-start border-t-[3px] border-brand bg-surface"><div className="flex flex-wrap items-baseline justify-between gap-2 border-x border-rule px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-[.1em]">{title}</h2><span className="text-xs text-muted">{note}</span></div><div className="plan-grid">{children}</div></section>;
}

function PlanBarRow({ actual, hasPlan, href, kind, label, planned, plannedAmount, completed = false, control, children }: {
  actual: number;
  hasPlan: boolean;
  href?: string;
  kind: "income" | "expense";
  label: string;
  planned: React.ReactNode;
  plannedAmount: number;
  completed?: boolean;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const maximum = Math.max(plannedAmount, actual, 1);
  const width = actual === 0 ? 0 : Math.max(2, Math.min(100, (actual / maximum) * 100));
  const over = hasPlan && actual > plannedAmount;
  // Going over is good news for income (green) but bad news for expenses (red).
  const tone = over ? (kind === "income" ? "is-good" : "is-over") : "";
  const percent = hasPlan && plannedAmount > 0 ? Math.round((actual / plannedAmount) * 100) : null;

  let status = "";
  if (over) status = `${formatMoney(actual - plannedAmount)} ${kind === "income" ? "above" : "over"} plan`;
  else if (hasPlan && actual === plannedAmount) status = "On plan";
  else if (hasPlan) status = `${formatMoney(plannedAmount - actual)} ${kind === "expense" ? "under plan" : "remaining"}`;

  const labelClass = "text-[13px] font-semibold text-brand underline-offset-4";
  return (
    <article className="plan-row">
      <div className="plan-row-head">
        <span className="plan-row-label">{href ? <Link className={`${labelClass} hover:underline`} href={href}>{label} →</Link> : <strong className={labelClass}>{label}</strong>}{completed ? <em className="plan-row-badge">Completed</em> : null}</span>
        <span className="plan-row-amounts">{formatMoney(actual)}{hasPlan || kind === "expense" ? <small> / {planned}</small> : null}{control}</span>
      </div>
      <div className="spend-track" aria-hidden="true"><span className={tone} style={{ width: `${width}%` }} /></div>
      <div className={`spend-row-meta${tone ? ` ${tone}` : ""}`}>
        <span>{hasPlan ? (percent === null ? `${formatMoney(plannedAmount)} plan` : `${percent}% of plan`) : "No plan set"}</span>
        <span>{status}</span>
      </div>
      {children}
    </article>
  );
}

function formatItemDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function SpendingItems({ items }: { items: SpendingItem[] }) {
  if (!items.length) return <p className="spend-breakdown-empty">No spending yet</p>;
  return (
    <details className="spend-breakdown">
      <summary>{items.length} {items.length === 1 ? "item makes" : "items make"} up this total</summary>
      <div className="spend-breakdown-list">
        {items.map((item) => (
          <div className="spend-breakdown-item" key={`${item.receipt}-${item.id}`}>
            <div>
              {item.receipt ? <Link href={`/finance/accounts/payable/${item.id}`}>{item.description}</Link> : <span>{item.description}</span>}
              <small>{formatItemDate(item.date)} · {item.receipt ? "Receipt" : "Manual"}</small>
            </div>
            <strong>{formatMoney(item.amount)}</strong>
          </div>
        ))}
      </div>
    </details>
  );
}
