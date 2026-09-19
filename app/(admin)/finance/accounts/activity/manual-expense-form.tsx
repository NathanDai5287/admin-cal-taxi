"use client";

import { useActionState, useOptimistic } from "react";

import { Button } from "@/components/brand/button";
import { OptimisticDeleteButton } from "@/components/forms/optimistic-delete-button";
import { PasteImageInput } from "@/components/forms/paste-image-input";
import { categories, formatCategory, formatMoney } from "@/lib/reimbursements/format";

import { addManualExpense, deleteManualExpense, type ActivityActionState } from "./actions";
import { formatEntryDate } from "./format";

export type ManualExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  receiptUrl?: string;
  pending?: boolean;
};

type FormState = ActivityActionState & { resetKey: number };

const initialState: FormState = { status: "idle", message: "", resetKey: 0 };

export function ManualExpenseForm({ expenses, today }: { expenses: ManualExpenseRow[]; today: string }) {
  const [optimisticExpenses, addOptimisticExpense] = useOptimistic(
    expenses,
    (current: ManualExpenseRow[], expense: ManualExpenseRow) => [expense, ...current],
  );
  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      addOptimisticExpense({
        id: `pending-${crypto.randomUUID()}`,
        expense_date: String(formData.get("expenseDate")),
        category: String(formData.get("category")),
        description: String(formData.get("description")),
        amount: Number(formData.get("amount")),
        pending: true,
      });
      const result = await addManualExpense(previous, formData);
      return { ...result, resetKey: result.status === "success" ? previous.resetKey + 1 : previous.resetKey };
    },
    initialState,
  );

  const total = optimisticExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <>
      <form key={state.resetKey} action={formAction} className="card-body border-t border-rule pt-5">
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
            {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}
          </div>
          <Button variant="primary" type="submit" disabled={pending}>{pending ? "Recording…" : "Record expense"}</Button>
        </div>
      </form>
      {optimisticExpenses.length ? (
        <div className="table-scroll border-t border-rule">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-3">
            <strong className="text-[12px] text-ink">Recorded direct expenses</strong>
            <span className="text-[12px] text-muted">{optimisticExpenses.length} entries · {formatMoney(total)}</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {optimisticExpenses.map((expense) => (
                <tr key={expense.id} className={expense.pending ? "opacity-60" : undefined}>
                  <td className="whitespace-nowrap">{formatEntryDate(expense.expense_date)}</td>
                  <td>{formatCategory(expense.category)}</td>
                  <td>{expense.description}{expense.receiptUrl && <div><a className="back-link" href={expense.receiptUrl} target="_blank" rel="noreferrer">View receipt</a></div>}</td>
                  <td className="amount">{formatMoney(expense.amount)}</td>
                  <td className="text-right">
                    {expense.pending
                      ? <span className="text-[12px] text-muted">Saving…</span>
                      : <OptimisticDeleteButton action={deleteManualExpense} value={expense.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-state border-t border-rule">No direct expenses have been recorded.</div>}
    </>
  );
}
