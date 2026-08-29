import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { saveReimbursementBudgets } from "@/app/reimbursements/admin/reports/actions";
import { AppHeader } from "@/components/reimbursements/app-header";
import { requireIdentity } from "@/lib/reimbursements/auth";
import { categories, formatMoney, formatStatus } from "@/lib/reimbursements/format";
import {
  filtersToSearchParams,
  loadReportPageRows,
  parseReportFilters,
  reimbursementStatuses,
  summarizeApproved,
} from "@/lib/reimbursements/reports";

export const metadata: Metadata = { title: "Reimbursement reports" };
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
  const [{ supabase, userId, email }, rawSearchParams] = await Promise.all([
    requireIdentity(),
    searchParams,
  ]);
  const filters = parseReportFilters(rawSearchParams);
  const [profilesResult, budgetQueryResult, rows] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    loadReportPageRows(supabase, filters),
  ]);

  if (profilesResult.error) {
    throw new Error(`Unable to load member profiles: ${profilesResult.error.message}`);
  }
  if (budgetQueryResult.error) {
    throw new Error(`Unable to load reimbursement budgets: ${budgetQueryResult.error.message}`);
  }

  const profiles = profilesResult.data ?? [];
  const profile = profiles.find((member) => member.id === userId);
  if (!profile) redirect("/reimbursements/login");
  if (profile.role !== "admin") redirect("/reimbursements/dashboard");

  const summary = summarizeApproved(rows);
  const budgets = new Map((budgetQueryResult.data ?? []).map((row) => [row.budget_key, row.amount === null ? null : Number(row.amount)]));
  const overallBudget = budgets.get("overall") ?? null;
  const maximumCategorySpend = Math.max(...Object.values(summary.byCategory), 1);
  const filterParams = filtersToSearchParams(filters);
  const exportHref = `/reimbursements/admin/reports/export${filterParams.size ? `?${filterParams}` : ""}`;
  const returnTo = `/reimbursements/admin/reports${filterParams.size ? `?${filterParams}` : ""}`;
  const budgetResult = typeof rawSearchParams.budget === "string" ? rawSearchParams.budget : "";

  return (
    <main className="app-shell">
      <AppHeader email={email} isAdmin name={profile.full_name} />
      <div className="app-content report-page">
        <div className="page-heading report-heading">
          <div>
            <p className="eyebrow">Chapter administration</p>
            <h1>Spending summary</h1>
            <p>Review requests, approved spending, and the chapter’s remaining budget.</p>
          </div>
          <div className="report-heading-actions">
            <Link className="button button-secondary" href={exportHref}>Export CSV</Link>
          </div>
        </div>

        <section className="panel report-filters" aria-labelledby="report-filter-title">
          <div className="panel-header report-section-heading">
            <div><h2 id="report-filter-title">Filter report</h2><p>Totals and exports use the same filters.</p></div>
            {filterParams.size > 0 && <Link className="back-link" href="/reimbursements/admin/reports">Clear filters</Link>}
          </div>
          <form className="report-filter-form" method="get">
            <div className="field"><label htmlFor="from">From</label><input defaultValue={filters.from} id="from" name="from" type="date" /></div>
            <div className="field"><label htmlFor="to">To</label><input defaultValue={filters.to} id="to" name="to" type="date" /></div>
            <div className="field"><label htmlFor="category">Category</label><select defaultValue={filters.category} id="category" name="category"><option value="">All categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label htmlFor="member">Member</label><select defaultValue={filters.member} id="member" name="member"><option value="">All members</option>{profiles.map((member) => <option key={member.id} value={member.id}>{member.full_name || "Unnamed member"}</option>)}</select></div>
            <div className="field"><label htmlFor="minAmount">Minimum amount</label><div className="money-input"><span>$</span><input defaultValue={filters.minAmount} id="minAmount" min="0" name="minAmount" placeholder="0.00" step="0.01" type="number" /></div></div>
            <div className="field"><label htmlFor="maxAmount">Maximum amount</label><div className="money-input"><span>$</span><input defaultValue={filters.maxAmount} id="maxAmount" min="0" name="maxAmount" placeholder="Any" step="0.01" type="number" /></div></div>
            <div className="field"><label htmlFor="status">Status</label><select defaultValue={filters.status} id="status" name="status"><option value="">All statuses</option>{reimbursementStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></div>
            <button className="button button-primary report-filter-submit" type="submit">Apply filters</button>
          </form>
        </section>

        <section className="report-stat-grid" aria-label="Report totals">
          <article className="report-stat report-stat-primary"><span>Approved spending</span><strong>{formatMoney(summary.approvedTotal)}</strong><small>{summary.approvedCount} approved {summary.approvedCount === 1 ? "request" : "requests"}</small></article>
          <article className="report-stat"><span>Overall budget</span><strong>{overallBudget === null ? "Not set" : formatMoney(overallBudget)}</strong><small>{remainingText(overallBudget, summary.approvedTotal)}</small></article>
          <article className="report-stat"><span>Requests shown</span><strong>{rows.length}</strong><small>Every matching status</small></article>
        </section>

        <div className="report-summary-grid">
          <section className="panel report-category-panel">
            <div className="panel-header report-section-heading"><div><h2>Spending by category</h2><p>Only approved reimbursements count.</p></div></div>
            <div className="category-spend-list">
              {categories.map(([category, label]) => {
                const spent = summary.byCategory[category];
                const limit = budgets.get(category) ?? null;
                const barMaximum = limit !== null ? Math.max(limit, spent, 1) : maximumCategorySpend;
                const width = spent === 0 ? 0 : Math.max(2, Math.min(100, (spent / barMaximum) * 100));
                const overBudget = limit !== null && spent > limit;
                return (
                  <article className="category-spend" key={category}>
                    <div className="category-spend-heading"><strong>{label}</strong><span>{formatMoney(spent)}</span></div>
                    <div className="category-spend-track" aria-hidden="true"><span className={overBudget ? "is-over" : ""} style={{ width: `${width}%` }} /></div>
                    <div className={`category-spend-meta${overBudget ? " is-over" : ""}`}><span>{limit === null ? "No category limit" : `${formatMoney(limit)} budget`}</span><span>{remainingText(limit, spent)}</span></div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel report-month-panel">
            <div className="panel-header report-section-heading"><div><h2>Monthly approved spending</h2><p>Grouped by submission month.</p></div></div>
            {summary.byMonth.length ? <div className="monthly-spend-list">{summary.byMonth.map(([month, total]) => <div key={month}><span>{formatMonth(month)}</span><strong>{formatMoney(total)}</strong></div>)}</div> : <div className="empty-state">No approved spending matches these filters.</div>}
          </section>
        </div>

        <section className="panel report-budget-panel">
          <div className="panel-header report-section-heading"><div><h2>Budget limits</h2><p>Leave a field blank to remove that limit.</p></div></div>
          <form action={saveReimbursementBudgets} className="budget-form">
            <input name="returnTo" type="hidden" value={returnTo} />
            <div className="budget-overall-row">
              <div><label htmlFor="overall">Overall chapter budget</label><p>Compared with all approved spending in the current report.</p></div>
              <div className="money-input"><span>$</span><input defaultValue={overallBudget ?? ""} id="overall" min="0" name="overall" placeholder="No limit" step="0.01" type="number" /></div>
            </div>
            <div className="budget-category-grid">
              {categories.map(([category, label]) => <div className="field" key={category}><label htmlFor={`budget-${category}`}>{label}</label><div className="money-input"><span>$</span><input defaultValue={budgets.get(category) ?? ""} id={`budget-${category}`} min="0" name={category} placeholder="No limit" step="0.01" type="number" /></div></div>)}
            </div>
            <div className="budget-form-footer">
              <div aria-live="polite">{budgetResult === "saved" && <p className="form-message success">Budget limits saved.</p>}{budgetResult === "invalid" && <p className="form-message">Enter a valid non-negative amount.</p>}{budgetResult === "error" && <p className="form-message">Budget limits could not be saved. Apply the latest database migration and try again.</p>}</div>
              <button className="button button-primary" type="submit">Save budget limits</button>
            </div>
          </form>
        </section>

        <section className="panel table-scroll report-results">
          <div className="panel-header report-section-heading"><div><h2>Matching reimbursements</h2><p>{rows.length} {rows.length === 1 ? "result" : "results"}; totals exclude non-approved requests.</p></div><Link className="button button-secondary button-compact" href={exportHref}>Download CSV</Link></div>
          {rows.length ? <table className="admin-table report-table"><thead><tr><th>Date</th><th>Member</th><th>Category</th><th>Amount</th><th>Status</th><th>Merchant</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.submitted_at).toLocaleDateString()}</td><td><Link className="report-detail-link" href={`/reimbursements/admin/${row.id}`}>{row.full_name}</Link></td><td>{formatStatus(row.category)}</td><td className="amount">{formatMoney(row.amount)}</td><td><span className={`badge badge-${row.status}`}>{formatStatus(row.status)}</span></td><td>{row.merchant || "—"}</td></tr>)}</tbody></table> : <div className="empty-state">No reimbursements match these filters.</div>}
        </section>
      </div>
    </main>
  );
}
