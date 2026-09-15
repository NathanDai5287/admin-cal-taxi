import { requireAdmin } from "@/lib/reimbursements/auth";
import { ButtonLink, Button } from "@/components/brand/button";
import type { Metadata } from "next";
import Link from "next/link";

import { categories, formatCategory, formatMoney, formatStatus } from "@/lib/reimbursements/format";
import {
  filtersToSearchParams,
  loadReportManualExpenses,
  loadReportPageRows,
  parseReportFilters,
  reimbursementStatuses,
  summarizeApproved,
} from "@/lib/reimbursements/reports";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function remainingText(limit: number | null, spent: number) {
  if (limit === null) return "No limit";
  const remaining = limit - spent;
  return remaining >= 0 ? `${formatMoney(remaining)} remaining` : `${formatMoney(Math.abs(remaining))} over`;
}

function formatExpenseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export default async function ReimbursementReportsPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requireAdmin();
  const rawSearchParams = await searchParams;
  const filters = parseReportFilters(rawSearchParams);
  const supabase = createAdminClient();
  const [namesResult, budgetQueryResult, budgetEntriesResult, rows, manualExpenses] = await Promise.all([
    supabase.from("reimbursements").select("full_name").order("full_name"),
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    supabase.from("reimbursement_budget_entries").select("amount").eq("kind", "forecast"),
    loadReportPageRows(supabase, filters),
    loadReportManualExpenses(supabase, filters),
  ]);

  if (namesResult.error) {
    throw new Error(`Unable to load member names: ${namesResult.error.message}`);
  }
  if (budgetQueryResult.error) {
    throw new Error(`Unable to load reimbursement budgets: ${budgetQueryResult.error.message}`);
  }
  if (budgetEntriesResult.error) {
    throw new Error(`Unable to load the total budget: ${budgetEntriesResult.error.message}`);
  }

  const memberNames = [...new Set((namesResult.data ?? []).map((row) => row.full_name))];
  const summary = summarizeApproved(rows, manualExpenses);
  const budgets = new Map((budgetQueryResult.data ?? []).map((row) => [row.budget_key, row.amount === null ? null : Number(row.amount)]));
  const overallBudget = (budgetEntriesResult.data ?? [])
    .reduce((total, entry) => total + Number(entry.amount), 0);
  const maximumCategorySpend = Math.max(...Object.values(summary.byCategory), 1);
  const filterParams = filtersToSearchParams(filters);
  const exportHref = `/finance/reports/export${filterParams.size ? `?${filterParams}` : ""}`;

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Spending summary</h1>
          <p className="page-lede">Read spending summaries and export recorded activity. Approved unpaid reimbursements are included in spending commitments.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ButtonLink variant="secondary" href="/finance/reports/financial">Download financial PDF</ButtonLink>
          <ButtonLink variant="secondary" href="/finance/reports/financial?format=json">Chart data JSON</ButtonLink>
          <ButtonLink variant="secondary" href={exportHref}>Export CSV</ButtonLink>
        </div>
      </div>

      <section className="card" aria-labelledby="report-filter-title">
        <div className="card-header justify-between">
          <div className="flex items-baseline gap-3">
            <span className="card-title" id="report-filter-title">Filter report</span>
            <span className="card-subtitle">Page totals and CSV use these filters; PDF and JSON cover all current activity.</span>
          </div>
          {filterParams.size > 0 && <Link className="back-link" href="/finance/reports">Clear filters</Link>}
        </div>
        <form className="card-body border-t border-rule pt-5 grid grid-cols-2 md:grid-cols-4 gap-4 items-end" method="get">
          <div className="field"><label className="field-label" htmlFor="from">From</label><input className="field-input" defaultValue={filters.from} id="from" name="from" type="date" /></div>
          <div className="field"><label className="field-label" htmlFor="to">To</label><input className="field-input" defaultValue={filters.to} id="to" name="to" type="date" /></div>
          <div className="field"><label className="field-label" htmlFor="category">Category</label><select className="field-input" defaultValue={filters.category} id="category" name="category"><option value="">All categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="member">Member</label><select className="field-input" defaultValue={filters.member} id="member" name="member"><option value="">All members</option>{memberNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="minAmount">Minimum amount</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={filters.minAmount} id="minAmount" min="0" name="minAmount" placeholder="0.00" step="0.01" type="number" /></div></div>
          <div className="field"><label className="field-label" htmlFor="maxAmount">Maximum amount</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={filters.maxAmount} id="maxAmount" min="0" name="maxAmount" placeholder="Any" step="0.01" type="number" /></div></div>
          <div className="field"><label className="field-label" htmlFor="status">Status</label><select className="field-input" defaultValue={filters.status} id="status" name="status"><option value="">All statuses</option>{reimbursementStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></div>
          <Button variant="primary" className="w-full" type="submit">Apply filters</Button>
        </form>
      </section>

      <section className="stat-grid" aria-label="Report totals">
        <article className="stat stat-primary"><span>Recorded spending</span><strong>{formatMoney(summary.approvedTotal)}</strong><small>{formatMoney(summary.receiptTotal)} receipts + {formatMoney(summary.manualTotal)} manual</small></article>
        <article className="stat"><span>Planned income</span><strong>{formatMoney(overallBudget)}</strong><small>{remainingText(overallBudget, summary.approvedTotal)}</small></article>
        <article className="stat"><span>Spending entries</span><strong>{summary.approvedCount + summary.manualCount}</strong><small>{summary.approvedCount} approved receipts, {summary.manualCount} manual</small></article>
      </section>

      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="card">
          <div className="card-header">
            <span className="card-title">Spending by category</span>
            <span className="card-subtitle">Approved receipts and manual entries are included.</span>
          </div>
          <div className="spend-list border-t border-rule">
            {categories.map(([category, label]) => {
              const spent = summary.byCategory[category];
              const limit = budgets.get(category) ?? null;
              const barMaximum = limit !== null ? Math.max(limit, spent, 1) : maximumCategorySpend;
              const width = spent === 0 ? 0 : Math.max(2, Math.min(100, (spent / barMaximum) * 100));
              const overBudget = limit !== null && spent > limit;
              const items = summary.byCategoryItems[category];
              return (
                <article className="spend-row" key={category}>
                  <div className="spend-row-heading"><strong className="text-[13.5px]">{label}</strong><span>{formatMoney(spent)}</span></div>
                  <div className="spend-track" aria-hidden="true"><span className={overBudget ? "is-over" : ""} style={{ width: `${width}%` }} /></div>
                  <div className={`spend-row-meta${overBudget ? " is-over" : ""}`}><span>{limit === null ? "No category limit" : `${formatMoney(limit)} budget`}</span><span>{remainingText(limit, spent)}</span></div>
                  {items.length > 0 && (
                    <details className="spend-breakdown">
                      <summary>{items.length} {items.length === 1 ? "item" : "items"} make up this total</summary>
                      <div className="spend-breakdown-list">
                        {items.map((item) => (
                          <div className="spend-breakdown-item" key={`${item.source}-${item.id}`}>
                            <div>
                              {item.source === "receipt"
                                ? <Link href={`/finance/review/${item.id}`}>{item.description}</Link>
                                : <span>{item.description}</span>}
                              <small>{formatExpenseDate(item.date)} · {item.source === "receipt" ? "Receipt" : "Manual"}</small>
                            </div>
                            <strong>{formatMoney(item.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Monthly approved spending</span>
            <span className="card-subtitle">Grouped by submission month.</span>
          </div>
          {summary.byMonth.length ? (
            <div className="spend-list border-t border-rule">
              {summary.byMonth.map(([month, total]) => (
                <div className="spend-row flex items-center justify-between gap-3.5" key={month}>
                  <span className="text-[13px] text-muted">{formatMonth(month)}</span>
                  <strong className="tabular-nums text-[13.5px]">{formatMoney(total)}</strong>
                </div>
              ))}
            </div>
          ) : <div className="empty-state border-t border-rule">No approved spending matches these filters.</div>}
        </section>
      </div>


      <section className="card table-scroll">
        <div className="card-header justify-between">
          <div className="flex items-baseline gap-3">
            <span className="card-title">Matching reimbursements</span>
            <span className="card-subtitle">{rows.length} {rows.length === 1 ? "result" : "results"}; totals exclude non-approved requests.</span>
          </div>
          <ButtonLink variant="secondary" compact href={exportHref}>Download CSV</ButtonLink>
        </div>
        {rows.length ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Member</th><th>Category</th><th>Amount</th><th>Status</th><th>Merchant</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{new Date(row.submitted_at).toLocaleDateString()}</td>
                  <td><Link className="submission-link relative" href={`/finance/review/${row.id}`}>{row.full_name}</Link></td>
                  <td>{formatCategory(row.category)}</td>
                  <td className="amount">{formatMoney(row.amount)}</td>
                  <td><span className={`badge badge-${row.status}`}>{formatStatus(row.status)}</span></td>
                  <td>{row.merchant || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty-state border-t border-rule">No reimbursements match these filters.</div>}
      </section>
    </div>
  );
}
