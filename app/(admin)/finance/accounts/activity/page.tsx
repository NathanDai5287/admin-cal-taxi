import { Button } from "@/components/brand/button";
import { PasteImageInput } from "@/components/forms/paste-image-input";
import { OptimisticDeleteButton } from "@/components/forms/optimistic-delete-button";
import { categories, formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { incomeSources } from "@/lib/reimbursements/financial-report";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { addManualExpense, deleteManualExpense, addIncomeEntry, deleteIncomeEntry, saveOpeningCash } from "./actions";

export const metadata = { title: "Account activity" };
export const dynamic = "force-dynamic";
function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US");
}
const formatExpenseDate = formatDate;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ manual?: string; entry?: string; settings?: string }> }) {
  const [, params] = await Promise.all([requireAdmin(), searchParams]);
  const { manual: manualResult, entry: entryResult, settings: settingsResult } = params;
  const supabase = createAdminClient();
  const results = await Promise.all([
    loadAllPages((from, to) => supabase.from("reimbursement_manual_expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }).range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("*").eq("kind", "income").order("budget_date", { ascending: false }).order("id", { ascending: false }).range(from, to)),
    supabase.from("chapter_financial_settings").select("opening_cash").eq("id", true).maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw new Error(`Unable to load account activity: ${result.error.message}`);
  const manualExpenses = (results[0].data ?? []).map((expense) => ({
    ...expense,
    receiptUrl: expense.receipt_path ? `/api/reimbursements/receipts/manual/${expense.id}` : undefined,
  }));
  const entries = results[1].data ?? [];
  const today = currentPacificDate();
  const directSpendingTotal = manualExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const incomeTotal = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  return <div className="grid gap-6">
    <div><p className="page-eyebrow">Chapter finances</p><h1 className="page-title">Other transactions</h1><p className="page-lede">Use this page for money that is not already recorded through dues or reimbursements.</p></div>

    <section className="grid gap-3 md:grid-cols-3" aria-labelledby="transaction-choice-title">
      <h2 className="sr-only" id="transaction-choice-title">Choose a transaction type</h2>
      <a className="account-choice" href="#record-expense"><strong>Chapter paid an expense</strong><span>Record a direct purchase or vendor payment.</span></a>
      <a className="account-choice" href="#record-income"><strong>Chapter received money</strong><span>Record fundraising, donations, or other income.</span></a>
      <a className="account-choice" href="#opening-cash"><strong>Set opening cash</strong><span>Update the starting balance used by reports.</span></a>
    </section>

      <section className="card scroll-mt-28" aria-labelledby="manual-expense-title" id="record-expense">
        <div className="card-header">
          <span className="card-title" id="manual-expense-title">Record a direct expense</span>
          <span className="card-subtitle">Use this when the chapter paid directly. Member reimbursements belong in Review.</span>
        </div>
        <form action={addManualExpense} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_1fr] items-end">
            <div className="field">
              <label className="field-label" htmlFor="manual-category">Category</label>
              <select className="field-input" id="manual-category" name="category" required>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="manual-date">Expense date</label>
              <input className="field-input" defaultValue={today} id="manual-date" name="expenseDate" type="date" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="manual-description">Description</label>
              <input className="field-input" id="manual-description" maxLength={500} name="description" placeholder="What makes up this amount?" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="manual-amount">Amount</label>
              <div className="money-input"><span>$</span><input className="field-input" id="manual-amount" min="0.01" name="amount" placeholder="0.00" step="0.01" type="number" required /></div>
            </div>
          </div>
          <div className="field mt-4">
            <label className="field-label" htmlFor="manual-receipt">Receipt image (optional)</label>
            <PasteImageInput
              accept="image/jpeg,image/png"
              acceptedTypes={["image/jpeg", "image/png"]}
              className="file-input"
              id="manual-receipt"
              maxBytes={3 * 1024 * 1024}
              name="receipt"
              validationMessage="Choose a non-empty JPG or PNG image up to 3 MB."
            />
            <p className="field-hint">Paste anywhere on this page, or choose a JPG or PNG up to 3 MB. Leave empty if there is no receipt.</p>
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {manualResult === "added" && <p className="form-message success">Manual expense added.</p>}
              {manualResult === "deleted" && <p className="form-message success">Manual expense removed.</p>}
              {manualResult === "receipt" && <p className="form-message">Choose a valid JPG or PNG image up to 3 MB.</p>}
              {manualResult === "invalid" && <p className="form-message">Enter a category, date, description, and positive amount.</p>}
              {manualResult === "error" && <p className="form-message">The manual expense could not be saved. Please try again.</p>}
            </div>
            <Button variant="primary" type="submit">Record expense</Button>
          </div>
        </form>
        {manualExpenses.length ? (
          <div className="table-scroll border-t border-rule">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-3">
              <strong className="text-[12px] text-ink">Recorded direct expenses</strong>
              <span className="text-[12px] text-muted">{manualExpenses.length} entries · {formatMoney(directSpendingTotal)}</span>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {manualExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="whitespace-nowrap">{formatExpenseDate(expense.expense_date)}</td>
                    <td>{formatCategory(expense.category)}</td>
                    <td>{expense.description}{expense.receiptUrl && <div><a className="back-link" href={expense.receiptUrl} target="_blank" rel="noreferrer">View receipt</a></div>}</td>
                    <td className="amount">{formatMoney(expense.amount)}</td>
                    <td className="text-right">
                      <OptimisticDeleteButton action={deleteManualExpense} value={expense.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No direct expenses have been recorded.</div>}
      </section>

      <section className="card scroll-mt-28" aria-labelledby="add-income-title" id="record-income">
        <div className="card-header">
          <span className="card-title" id="add-income-title">Record income</span>
          <span className="card-subtitle">Use this for money received outside dues. Dues payments belong in Dues to collect.</span>
        </div>
        <form action={addIncomeEntry} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1.25fr_2fr_1fr] items-end">
            <div className="field">
              <label className="field-label" htmlFor="income-date">Date</label>
              <input className="field-input" defaultValue={currentPacificDate()} id="income-date" name="budgetDate" type="date" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="income-source">Income source</label>
              <select className="field-input" id="income-source" name="source" required>
                {incomeSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="income-description">Description</label>
              <input className="field-input" id="income-description" maxLength={500} name="description" placeholder="Where did these funds come from?" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="income-amount">Amount</label>
              <div className="money-input"><span>$</span><input className="field-input" id="income-amount" min="0.01" name="amount" placeholder="0.00" step="0.01" type="number" required /></div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
            <div aria-live="polite">
              {entryResult === "added" && <p className="form-message success">Income recorded.</p>}
              {entryResult === "deleted" && <p className="form-message success">Income entry removed.</p>}
              {entryResult === "invalid" && <p className="form-message">Enter a date, description, and positive amount.</p>}
              {entryResult === "error" && <p className="form-message">The income entry could not be saved. Please try again.</p>}
            </div>
            <Button variant="primary" type="submit">Record income</Button>
          </div>
        </form>
        {entries.length ? (
          <div className="table-scroll border-t border-rule">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-3">
              <strong className="text-[12px] text-ink">Recorded other income</strong>
              <span className="text-[12px] text-muted">{entries.length} entries · {formatMoney(incomeTotal)}</span>
            </div>
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
                      <OptimisticDeleteButton action={deleteIncomeEntry} value={entry.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No income entries have been recorded yet.</div>}
      </section>

    <section className="card scroll-mt-28" id="opening-cash">
      <div className="card-header"><span className="card-title">Opening cash</span><span className="card-subtitle">Account setup used by financial reports.</span></div>
      <form action={saveOpeningCash} className="card-body grid gap-4">
        <div className="max-w-[360px] field"><label className="field-label" htmlFor="opening-cash-amount">Cash at the start of the current term</label><div className="money-input"><span>$</span><input className="field-input" id="opening-cash-amount" name="openingCash" type="number" min="0" step="0.01" defaultValue={results[2].data?.opening_cash ?? 0} required /></div><p className="field-hint">Change this only when correcting the starting balance. Day-to-day income and expenses belong above.</p></div>
        {settingsResult && <p role="status">{settingsResult === "saved" ? "Opening cash saved." : "Unable to save opening cash. Check the amount and try again."}</p>}
        <Button variant="secondary" type="submit">Save opening cash</Button>
      </form>
    </section>
  </div>;
}
