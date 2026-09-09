import { Button } from "@/components/brand/button";
import type { Metadata } from "next";

import {
  addReceivable,
  addBudgetEntry,
  deleteBudgetEntry,
  deleteReceivable,
  saveFinancialSettings,
  saveReimbursementBudgets,
  updateReceivablePaid,
} from "@/app/(admin)/reimbursements/(review)/budgets/actions";
import { incomeSources } from "@/lib/reimbursements/financial-report";
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
  const [budgetResult, entriesResult, settingsResult, receivablesResult, rows, manualExpenses] = await Promise.all([
    supabase.from("reimbursement_budgets").select("budget_key, amount"),
    supabase
      .from("reimbursement_budget_entries")
      .select("id, amount, description, source, budget_date, created_by, created_at, updated_at")
      .order("budget_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("chapter_financial_settings")
      .select("chapter_name, term_label, term_start, term_end, opening_cash")
      .eq("id", true)
      .single(),
    supabase
      .from("chapter_receivables")
      .select("id, member_name, amount_assessed, amount_paid, due_date, notes")
      .order("due_date")
      .order("member_name"),
    loadReportPageRows(supabase, filters),
    loadReportManualExpenses(supabase, filters),
  ]);

  if (budgetResult.error) throw new Error(`Unable to load budget limits: ${budgetResult.error.message}`);
  if (entriesResult.error) throw new Error(`Unable to load budget history: ${entriesResult.error.message}`);

  const now = new Date();
  const currentYear = now.getFullYear();
  const isFall = now.getMonth() >= 7;
  const defaultSettings = {
    chapter_name: "Theta Xi",
    term_label: `${isFall ? "Fall" : "Spring"} ${currentYear}`,
    term_start: `${currentYear}-${isFall ? "08-01" : "01-01"}`,
    term_end: `${currentYear}-${isFall ? "12-31" : "07-31"}`,
    opening_cash: 0,
  };
  const settings = settingsResult.data ?? defaultSettings;
  const receivables = receivablesResult.data ?? [];
  const budgets = new Map((budgetResult.data ?? []).map((row) => [row.budget_key, row.amount === null ? null : Number(row.amount)]));
  const entries = entriesResult.data ?? [];
  const accountsReceivable = receivables.reduce(
    (total, row) => total + Math.max(0, Number(row.amount_assessed) - Number(row.amount_paid)),
    0,
  );
  const totalBudget = entries.reduce((total, entry) => total + Number(entry.amount), 0);
  const allocatedBudget = categories.reduce((total, [category]) => total + (budgets.get(category) ?? 0), 0);
  const unallocatedBudget = totalBudget - allocatedBudget;
  const spending = summarizeApproved(rows, manualExpenses).approvedTotal;
  const remainingBudget = totalBudget - spending;
  const entryResult = typeof rawSearchParams.entry === "string" ? rawSearchParams.entry : "";
  const limitsResult = typeof rawSearchParams.limits === "string" ? rawSearchParams.limits : "";
  const settingsSaveResult = typeof rawSearchParams.settings === "string" ? rawSearchParams.settings : "";
  const receivableResult = typeof rawSearchParams.receivable === "string" ? rawSearchParams.receivable : "";

  return (
    <div className="grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter reimbursements</p>
        <h1 className="page-title">Budgets</h1>
        <p className="page-lede">Track incoming budget funds separately from category allocations.</p>
      </div>

      <section className="card">
        <div className="card-header">
          <span className="card-title">Financial report settings</span>
          <span className="card-subtitle">Defines the current term and opening cash used by the PDF report.</span>
        </div>
        <form action={saveFinancialSettings} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="field"><label className="field-label" htmlFor="chapter-name">Chapter name</label><input className="field-input" defaultValue={settings.chapter_name} id="chapter-name" maxLength={120} name="chapterName" required /></div>
            <div className="field"><label className="field-label" htmlFor="term-label">Term label</label><input className="field-input" defaultValue={settings.term_label} id="term-label" maxLength={120} name="termLabel" required /></div>
            <div className="field"><label className="field-label" htmlFor="term-start">Starts</label><input className="field-input" defaultValue={settings.term_start} id="term-start" name="termStart" type="date" required /></div>
            <div className="field"><label className="field-label" htmlFor="term-end">Ends</label><input className="field-input" defaultValue={settings.term_end} id="term-end" name="termEnd" type="date" required /></div>
            <div className="field"><label className="field-label" htmlFor="opening-cash">Opening cash</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={settings.opening_cash} id="opening-cash" min="0" name="openingCash" step="0.01" type="number" required /></div></div>
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {settingsSaveResult === "saved" && <p className="form-message success">Report settings saved.</p>}
              {settingsSaveResult === "invalid" && <p className="form-message">Enter a valid term, date range, and opening cash amount.</p>}
              {settingsSaveResult === "error" && <p className="form-message">Report settings could not be saved.</p>}
            </div>
            <Button variant="primary" type="submit">Save report settings</Button>
          </div>
        </form>
      </section>

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1.25fr_2fr_1fr] items-end">
            <div className="field">
              <label className="field-label" htmlFor="budget-date">Date</label>
              <input className="field-input" defaultValue={currentPacificDate()} id="budget-date" name="budgetDate" type="date" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="budget-source">Income source</label>
              <select className="field-input" id="budget-source" name="source" required>
                {incomeSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
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
            <Button variant="primary" type="submit">Add to budget</Button>
          </div>
        </form>
        {entries.length ? (
          <div className="table-scroll border-t border-rule">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Amount added</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{formatDate(entry.budget_date)}</td>
                    <td>{incomeSources.find(([value]) => value === entry.source)?.[1] ?? "Other income"}</td>
                    <td>{entry.description}</td>
                    <td className="amount">{formatMoney(entry.amount)}</td>
                    <td className="text-right">
                      <form action={deleteBudgetEntry}>
                        <input name="id" type="hidden" value={entry.id} />
                        <Button variant="secondary" compact type="submit">Remove</Button>
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
          <span className="card-title">Member dues receivable</span>
          <span className="card-subtitle">{formatMoney(accountsReceivable)} remains unpaid across {receivables.length} balances.</span>
        </div>
        <form action={addReceivable} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="field"><label className="field-label" htmlFor="receivable-member">Member</label><input className="field-input" id="receivable-member" maxLength={120} name="memberName" required /></div>
            <div className="field"><label className="field-label" htmlFor="receivable-due">Due date</label><input className="field-input" defaultValue={currentPacificDate()} id="receivable-due" name="dueDate" type="date" required /></div>
            <div className="field"><label className="field-label" htmlFor="receivable-assessed">Assessed</label><div className="money-input"><span>$</span><input className="field-input" id="receivable-assessed" min="0.01" name="amountAssessed" step="0.01" type="number" required /></div></div>
            <div className="field"><label className="field-label" htmlFor="receivable-paid">Paid</label><div className="money-input"><span>$</span><input className="field-input" defaultValue="0" id="receivable-paid" min="0" name="amountPaid" step="0.01" type="number" required /></div></div>
            <div className="field"><label className="field-label" htmlFor="receivable-notes">Notes</label><input className="field-input" id="receivable-notes" maxLength={500} name="notes" /></div>
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {receivableResult === "added" && <p className="form-message success">Member balance added.</p>}
              {receivableResult === "saved" && <p className="form-message success">Payment total updated.</p>}
              {receivableResult === "deleted" && <p className="form-message success">Member balance removed.</p>}
              {receivableResult === "invalid" && <p className="form-message">Enter valid balance details; paid cannot exceed assessed.</p>}
              {receivableResult === "error" && <p className="form-message">The member balance could not be saved.</p>}
            </div>
            <Button variant="primary" type="submit">Add member balance</Button>
          </div>
        </form>
        {receivables.length ? (
          <div className="table-scroll border-t border-rule">
            <table className="data-table">
              <thead><tr><th>Due</th><th>Member</th><th>Assessed</th><th>Paid</th><th>Unpaid</th><th>Notes</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {receivables.map((row) => {
                  const assessed = Number(row.amount_assessed);
                  const paid = Number(row.amount_paid);
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{formatDate(row.due_date)}</td>
                      <td>{row.member_name}</td>
                      <td className="amount">{formatMoney(assessed)}</td>
                      <td>
                        <form action={updateReceivablePaid} className="flex items-center gap-2 min-w-[150px]">
                          <input name="id" type="hidden" value={row.id} />
                          <input name="amountAssessed" type="hidden" value={assessed} />
                          <div className="money-input"><span>$</span><input aria-label={`Amount paid by ${row.member_name}`} className="field-input py-1.5" defaultValue={paid} max={assessed} min="0" name="amountPaid" step="0.01" type="number" /></div>
                          <Button variant="secondary" compact type="submit">Save</Button>
                        </form>
                      </td>
                      <td className="amount">{formatMoney(assessed - paid)}</td>
                      <td>{row.notes || "—"}</td>
                      <td className="text-right"><form action={deleteReceivable}><input name="id" type="hidden" value={row.id} /><Button variant="secondary" compact type="submit">Remove</Button></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No member dues balances have been added.</div>}
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
            <Button variant="primary" type="submit">Save category limits</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
