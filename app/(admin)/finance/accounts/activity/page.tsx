import { Button } from "@/components/brand/button";
import { categories, formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { incomeSources } from "@/lib/reimbursements/financial-report";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { requireAdmin } from "@/lib/reimbursements/auth";
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
  await requireAdmin();
  const { manual: manualResult, entry: entryResult, settings: settingsResult } = await searchParams;
  const supabase = createAdminClient();
  const results = await Promise.all([
    supabase.from("reimbursement_manual_expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("reimbursement_budget_entries").select("*").eq("kind", "income").order("budget_date", { ascending: false }),
    supabase.from("chapter_financial_settings").select("opening_cash").eq("id", true).maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw new Error(`Unable to load account activity: ${result.error.message}`);
  const manualExpenses = await Promise.all((results[0].data ?? []).map(async (expense) => {
    const receipt = expense.receipt_path ? await supabase.storage.from("receipts").createSignedUrl(expense.receipt_path, 300) : null;
    return { ...expense, receiptUrl: receipt?.data?.signedUrl };
  }));
  const entries = results[1].data ?? [];
  const today = currentPacificDate();
  return <div className="grid gap-6">
    <div><p className="page-eyebrow">Chapter finances</p><h1 className="page-title">Account activity</h1><p className="page-lede">Record direct spending and other income. Record dues collections in Receivable and reimbursement payouts in Payable.</p></div>
      <section className="card" aria-labelledby="manual-expense-title">
        <div className="card-header">
          <span className="card-title" id="manual-expense-title">Direct spending</span>
          <span className="card-subtitle">Record direct chapter payments. Receipt images are optional.</span>
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
            <input className="field-input" id="manual-receipt" name="receipt" type="file" accept="image/jpeg,image/png" />
            <p className="field-hint">JPG or PNG, up to 3 MB. Leave empty if there is no receipt.</p>
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
                      <form action={deleteManualExpense}>
                        <input name="id" type="hidden" value={expense.id} />
                                      <Button variant="secondary" compact type="submit">Remove</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No manual expenses match these filters.</div>}
      </section>

      <section className="card" aria-labelledby="add-income-title">
        <div className="card-header">
          <span className="card-title" id="add-income-title">Record income</span>
          <span className="card-subtitle">Record money received outside the dues collection workflow.</span>
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
                      <form action={deleteIncomeEntry}>
                        <input name="id" type="hidden" value={entry.id} />
                        <Button variant="secondary" compact type="submit">Remove</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state border-t border-rule">No income entries have been recorded yet.</div>}
      </section>

    <section className="card">
      <div className="card-header"><span className="card-title">Opening cash</span></div>
      <form action={saveOpeningCash} className="card-body grid gap-4">
        <div className="field"><label className="field-label" htmlFor="opening-cash">Cash at the start of the current term</label><input className="field-input" id="opening-cash" name="openingCash" type="number" min="0" step="0.01" defaultValue={results[2].data?.opening_cash ?? 0} required /></div>
        {settingsResult && <p role="status">{settingsResult === "saved" ? "Opening cash saved." : "Unable to save opening cash. Check the amount and try again."}</p>}
        <Button variant="secondary" type="submit">Save opening cash</Button>
      </form>
    </section>
  </div>;
}
