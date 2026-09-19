"use client";

import { useActionState, useOptimistic } from "react";

import { Button } from "@/components/brand/button";
import { OptimisticDeleteButton } from "@/components/forms/optimistic-delete-button";
import { incomeSources } from "@/lib/reimbursements/financial-report";
import { formatMoney } from "@/lib/reimbursements/format";

import { addIncomeEntry, deleteIncomeEntry, type ActivityActionState } from "./actions";
import { formatEntryDate } from "./format";

export type IncomeEntryRow = {
  id: string;
  budget_date: string;
  description: string;
  amount: number;
  source: string;
  pending?: boolean;
};

type FormState = ActivityActionState & { resetKey: number };

const initialState: FormState = { status: "idle", message: "", resetKey: 0 };

export function IncomeEntryForm({ entries, today }: { entries: IncomeEntryRow[]; today: string }) {
  const [optimisticEntries, addOptimisticEntry] = useOptimistic(
    entries,
    (current: IncomeEntryRow[], entry: IncomeEntryRow) => [entry, ...current],
  );
  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      addOptimisticEntry({
        id: `pending-${crypto.randomUUID()}`,
        budget_date: String(formData.get("budgetDate")),
        description: String(formData.get("description")),
        amount: Number(formData.get("amount")),
        source: "alumni_donations",
        pending: true,
      });
      const result = await addIncomeEntry(previous, formData);
      return { ...result, resetKey: result.status === "success" ? previous.resetKey + 1 : previous.resetKey };
    },
    initialState,
  );

  const total = optimisticEntries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <>
      <form key={state.resetKey} action={formAction} className="card-body border-t border-rule pt-5">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr] items-end">
          <div className="field">
            <label className="field-label" htmlFor="income-date">Date</label>
            <input className="field-input" defaultValue={today} id="income-date" name="budgetDate" type="date" required />
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
            {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}
          </div>
          <Button variant="primary" type="submit" disabled={pending}>{pending ? "Recording…" : "Record donation"}</Button>
        </div>
      </form>
      {optimisticEntries.length ? (
        <div className="table-scroll border-t border-rule">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-3">
            <strong className="text-[12px] text-ink">Recorded other income</strong>
            <span className="text-[12px] text-muted">{optimisticEntries.length} entries · {formatMoney(total)}</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Amount added</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {optimisticEntries.map((entry) => (
                <tr key={entry.id} className={entry.pending ? "opacity-60" : undefined}>
                  <td className="whitespace-nowrap">{formatEntryDate(entry.budget_date)}</td>
                  <td>{incomeSources.find(([value]) => value === entry.source)?.[1] ?? "Other income"}</td>
                  <td>{entry.description}</td>
                  <td className="amount">{formatMoney(entry.amount)}</td>
                  <td className="text-right">
                    {entry.pending
                      ? <span className="text-[12px] text-muted">Saving…</span>
                      : <OptimisticDeleteButton action={deleteIncomeEntry} value={entry.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-state border-t border-rule">No income entries have been recorded yet.</div>}
    </>
  );
}
