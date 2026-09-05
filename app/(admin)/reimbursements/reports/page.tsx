import type { Metadata } from "next";
import Link from "next/link";

import { saveReimbursementBudgets } from "@/app/(admin)/reimbursements/reports/actions";
import { categories, formatMoney, formatStatus } from "@/lib/reimbursements/format";
import {
  filtersToSearchParams,
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

export default async function ReimbursementReportsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const rawSearchParams = await searchParams;
  const filters = parseReportFilters(rawSearchParams);
  const supabase = createAdminClient();
  const [namesResult, budgetQueryResult, rows] = await Promise.all([
    supabase.from("reimbursements").select("full_name").order("full_name"),
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    loadReportPageRows(supabase, filters),
  ]);

  if (namesResult.error) {
    throw new Error(`Unable to load member names: ${namesResult.error.message}`);
  }
  if (budgetQueryResult.error) {
    throw new Error(`Unable to load reimbursement budgets: ${budgetQueryResult.error.message}`);
  }

  const memberNames = [...new Set((namesResult.data ?? []).map((row) => row.full_name))];
  const summary = summarizeApproved(rows);
  const budgets = new Map((budgetQueryResult.data ?? []).map((row) => [row.budget_key, row.amount === null ? null : Number(row.amount)]));
  const overallBudget = budgets.get("overall") ?? null;
  const maximumCategorySpend = Math.max(...Object.values(summary.byCategory), 1);
  const filterParams = filtersToSearchParams(filters);
  const exportHref = `/reimbursements/reports/export${filterParams.size ? `?${filterParams}` : ""}`;
  const returnTo = `/reimbursements/reports${filterParams.size ? `?${filterParams}` : ""}`;
  const budgetResult = typeof rawSearchParams.budget === "string" ? rawSearchParams.budget : "";

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="page-eyebrow">Chapter reimbursements</p>
          <h1 className="page-title">Spending summary</h1>
          <p className="page-lede">Review requests, approved spending, and the chapter’s remaining budget.</p>
        </div>
        <Link className="btn-ghost" href={exportHref}>Export CSV</Link>
      </div>

      <section className="card" aria-labelledby="report-filter-title">
        <div className="card-header justify-between">
          <div className="flex items-baseline gap-3">
            <span className="card-title" id="report-filter-title">Filter report</span>
            <span className="card-subtitle">Totals and exports use the same filters.</span>
          </div>
          {filterParams.size > 0 && <Link className="back-link" href="/reimbursements/reports">Clear filters</Link>}
        </div>
        <form className="card-body border-t border-rule pt-5 grid grid-cols-2 md:grid-cols-4 gap-4 items-end" method="get">
          <div className="field"><label className="field-label" htmlFor="from">From</label><input className="field-input" defaultValue={filters.from} id="from" name="from" type="date" /></div>
          <div className="field"><label className="field-label" htmlFor="to">To</label><input className="field-input" defaultValue={filters.to} id="to" name="to" type="date" /></div>
          <div className="field"><label className="field-label" htmlFor="category">Category</label><select className="field-input" defaultValue={filters.category} id="category" name="category"><option value="">All categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="member">Member</label><select className="field-input" defaultValue={filters.member} id="member" name="member"><option value="">All members</option>{memberNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="minAmount">Minimum amount</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={filters.minAmount} id="minAmount" min="0" name="minAmount" placeholder="0.00" step="0.01" type="number" /></div></div>
          <div className="field"><label className="field-label" htmlFor="maxAmount">Maximum amount</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={filters.maxAmount} id="maxAmount" min="0" name="maxAmount" placeholder="Any" step="0.01" type="number" /></div></div>
          <div className="field"><label className="field-label" htmlFor="status">Status</label><select className="field-input" defaultValue={filters.status} id="status" name="status"><option value="">All statuses</option>{reimbursementStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></div>
          <button className="btn-primary w-full" type="submit">Apply filters</button>
        </form>
      </section>

      <section className="stat-grid" aria-label="Report totals">
        <article className="stat stat-primary"><span>Approved spending</span><strong>{formatMoney(summary.approvedTotal)}</strong><small>{summary.approvedCount} approved {summary.approvedCount === 1 ? "request" : "requests"}</small></article>
        <article className="stat"><span>Overall budget</span><strong>{overallBudget === null ? "Not set" : formatMoney(overallBudget)}</strong><small>{remainingText(overallBudget, summary.approvedTotal)}</small></article>
        <article className="stat"><span>Requests shown</span><strong>{rows.length}</strong><small>Every matching status</small></article>
      </section>

      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="card">
          <div className="card-header">
            <span className="card-title">Spending by category</span>
            <span className="card-subtitle">Only approved reimbursements count.</span>
          </div>
          <div className="spend-list border-t border-rule">
            {categories.map(([category, label]) => {
              const spent = summary.byCategory[category];
              const limit = budgets.get(category) ?? null;
              const barMaximum = limit !== null ? Math.max(limit, spent, 1) : maximumCategorySpend;
              const width = spent === 0 ? 0 : Math.max(2, Math.min(100, (spent / barMaximum) * 100));
              const overBudget = limit !== null && spent > limit;
              return (
                <article className="spend-row" key={category}>
                  <div className="spend-row-heading"><strong className="text-[13.5px]">{label}</strong><span>{formatMoney(spent)}</span></div>
                  <div className="spend-track" aria-hidden="true"><span className={overBudget ? "is-over" : ""} style={{ width: `${width}%` }} /></div>
                  <div className={`spend-row-meta${overBudget ? " is-over" : ""}`}><span>{limit === null ? "No category limit" : `${formatMoney(limit)} budget`}</span><span>{remainingText(limit, spent)}</span></div>
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

      <section className="card">
        <div className="card-header">
          <span className="card-title">Budget limits</span>
          <span className="card-subtitle">Leave a field blank to remove that limit.</span>
        </div>
        <form action={saveReimbursementBudgets} className="card-body border-t border-rule pt-5">
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="flex items-center justify-between gap-6 flex-wrap border-b border-rule pb-5">
            <div>
              <label className="field-label mb-1" htmlFor="overall">Overall chapter budget</label>
              <p className="helper-text m-0">Compared with all approved spending in the current report.</p>
            </div>
            <div className="money-input w-full sm:w-[220px]"><span>$</span><input className="field-input" defaultValue={overallBudget ?? ""} id="overall" min="0" name="overall" placeholder="No limit" step="0.01" type="number" /></div>
          </div>
          <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(([category, label]) => (
              <div className="field" key={category}>
                <label className="field-label" htmlFor={`budget-${category}`}>{label}</label>
                <div className="money-input"><span>$</span><input className="field-input" defaultValue={budgets.get(category) ?? ""} id={`budget-${category}`} min="0" name={category} placeholder="No limit" step="0.01" type="number" /></div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule pt-4 min-h-[44px]">
            <div aria-live="polite">
              {budgetResult === "saved" && <p className="form-message success">Budget limits saved.</p>}
              {budgetResult === "invalid" && <p className="form-message">Enter a valid non-negative amount.</p>}
              {budgetResult === "error" && <p className="form-message">Budget limits could not be saved. Apply the latest database migration and try again.</p>}
            </div>
            <button className="btn-primary" type="submit">Save budget limits</button>
          </div>
        </form>
      </section>

      <section className="card table-scroll">
        <div className="card-header justify-between">
          <div className="flex items-baseline gap-3">
            <span className="card-title">Matching reimbursements</span>
            <span className="card-subtitle">{rows.length} {rows.length === 1 ? "result" : "results"}; totals exclude non-approved requests.</span>
          </div>
          <Link className="btn-ghost btn-compact" href={exportHref}>Download CSV</Link>
        </div>
        {rows.length ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Member</th><th>Category</th><th>Amount</th><th>Status</th><th>Merchant</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{new Date(row.submitted_at).toLocaleDateString()}</td>
                  <td><Link className="submission-link relative" href={`/reimbursements/${row.id}`}>{row.full_name}</Link></td>
                  <td>{formatStatus(row.category)}</td>
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
