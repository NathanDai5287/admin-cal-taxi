import type { Metadata } from "next";

import {
  addBudgetEntry,
  deleteBudgetEntry,
  saveReimbursementBudgets,
} from "@/app/(admin)/reimbursements/(review)/budgets/actions";
import { categories, formatMoney } from "@/lib/reimbursements/format";
import {
  loadReportManualExpenses,
  loadReportPageRows,
  parseReportFilters,
  summarizeApproved,
} from "@/lib/reimbursements/reports";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Budgets" };
export const dynamic = "force-dynamic";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function currentPacificDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Los_Angeles",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function signedMoney(value: number) {
  return value >= 0 ? formatMoney(value) : `${formatMoney(Math.abs(value))} over`;
}

export default async function ReimbursementBudgetsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const rawSearchParams = await searchParams;
  const supabase = createAdminClient();
  const filters = parseReportFilters({});
  const [budgetResult, entriesResult, rows, manualExpenses] = await Promise.all([
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    supabase
      .from("reimbursement_budget_entries")
      .select("id, amount, description, budget_date, created_by, created_at, updated_at")
      .order("budget_date", { ascending: false })
      .order("created_at", { ascending: false }),
    loadReportPageRows(supabase, filters),
    loadReportManualExpenses(supabase, filters),
  ]);

  if (budgetResult.error) throw new Error(`Unable to load budget limits: ${budgetResult.error.message}`);
  if (entriesResult.error) throw new Error(`Unable to load budget history: ${entriesResult.error.message}`);

  const budgets = new Map((budgetResult.data ?? []).map((row) => [row.budget_key, row.amount === null ? null : Number(row.amount)]));
  const entries = entriesResult.data ?? [];
  const totalBudget = entries.reduce((total, entry) => total + Number(entry.amount), 0);
  const allocatedBudget = categories.reduce((total, [category]) => total + (budgets.get(category) ?? 0), 0);
  const unallocatedBudget = totalBudget - allocatedBudget;
  const spending = summarizeApproved(rows, manualExpenses).approvedTotal;
  const remainingBudget = totalBudget - spending;
  const entryResult = typeof rawSearchParams.entry === "string" ? rawSearchParams.entry : "";
  const limitsResult = typeof rawSearchParams.limits === "string" ? rawSearchParams.limits : "";

  return (
    <div className="grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter reimbursements</p>
        <h1 className="page-title">Budgets</h1>
        <p className="page-lede">Track incoming budget funds separately from category allocations.</p>
      </div>

      <section className="stat-grid" aria-label="Budget totals">
        <article className="stat stat-primary"><span>Total budget</span><strong>{formatMoney(totalBudget)}</strong><small>{entries.length} funding {entries.length === 1 ? "entry" : "entries"}</small></article>
        <article className="stat"><span>Unallocated</span><strong>{signedMoney(unallocatedBudget)}</strong><small>{formatMoney(allocatedBudget)} assigned to category limits</small></article>
        <article className="stat"><span>After spending</span><strong>{signedMoney(remainingBudget)}</strong><small>{formatMoney(spending)} recorded spending</small></article>
      </section>

      <section className="card" aria-labelledby="add-budget-title">
        <div className="card-header">
          <span className="card-title" id="add-budget-title">Add budget</span>
          <span className="card-subtitle">Adds to the total budget without allocating funds to a category.</span>
        </div>
        <form action={addBudgetEntry} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr] items-end">
            <div className="field">
              <label className="field-label" htmlFor="budget-date">Date</label>
              <input className="field-input" defaultValue={currentPacificDate()} id="budget-date" name="budgetDate" type="date" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="budget-description">Description</label>
              <input className="field-input" id="budget-description" maxLength={500} name="description" placeholder="Where did these funds come from?" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="budget-amount">Amount</label>
              <div className="money-input"><span>$</span><input className="field-input" id="budget-amount" min="0.01" name="amount" placeholder="0.00" step="0.01" type="number" required /></div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {entryResult === "added" && <p className="form-message success">Budget funds added.</p>}
              {entryResult === "deleted" && <p className="form-message success">Budget entry removed.</p>}
              {entryResult === "invalid" && <p className="form-message">Enter a date, description, and positive amount.</p>}
              {entryResult === "error" && <p className="form-message">The budget entry could not be saved. Apply the latest database migration and try again.</p>}
            </div>
            <button className="btn-primary" type="submit">Add to budget</button>
          </div>
        </form>
        {entries.length ? (
          <div className="table-scroll border-t border-rule">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Description</th><th>Amount added</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{formatDate(entry.budget_date)}</td>
                    <td>{entry.description}</td>
                    <td className="amount">{formatMoney(entry.amount)}</td>
                    <td className="text-right">
                      <form action={deleteBudgetEntry}>
                        <input name="id" type="hidden" value={entry.id} />
                        <button className="btn-ghost btn-compact" type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No budget funds have been added yet.</div>}
      </section>

      <section className="card">
        <div className="card-header">
          <span className="card-title">Category limits</span>
          <span className="card-subtitle">These allocations do not change the total budget.</span>
        </div>
        <form action={saveReimbursementBudgets} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(([category, label]) => (
              <div className="field" key={category}>
                <label className="field-label" htmlFor={`budget-${category}`}>{label}</label>
                <div className="money-input"><span>$</span><input className="field-input" defaultValue={budgets.get(category) ?? ""} id={`budget-${category}`} min="0" name={category} placeholder="No limit" step="0.01" type="number" /></div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {limitsResult === "saved" && <p className="form-message success">Category limits saved.</p>}
              {limitsResult === "invalid" && <p className="form-message">Enter valid non-negative amounts.</p>}
              {limitsResult === "error" && <p className="form-message">Category limits could not be saved.</p>}
            </div>
            <button className="btn-primary" type="submit">Save category limits</button>
          </div>
        </form>
      </section>
    </div>
  );
}
