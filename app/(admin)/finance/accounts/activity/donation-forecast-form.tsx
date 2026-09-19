"use client";

import { useActionState, useOptimistic } from "react";

import { Button } from "@/components/brand/button";
import { OptimisticDeleteButton } from "@/components/forms/optimistic-delete-button";
import { formatMoney } from "@/lib/reimbursements/format";

import { addDonationForecast, deleteDonationForecast, type ActivityActionState } from "./actions";
import { formatEntryDate } from "./format";

export type DonationForecastRow = {
  id: string;
  budget_date: string;
  description: string;
  amount: number;
  pending?: boolean;
};

type FormState = ActivityActionState & { resetKey: number };

const initialState: FormState = { status: "idle", message: "", resetKey: 0 };

export function DonationForecastForm({ forecasts, today }: { forecasts: DonationForecastRow[]; today: string }) {
  const [optimisticForecasts, addOptimisticForecast] = useOptimistic(
    forecasts,
    (current: DonationForecastRow[], entry: DonationForecastRow) => [entry, ...current],
  );
  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      addOptimisticForecast({
        id: `pending-${crypto.randomUUID()}`,
        budget_date: String(formData.get("budgetDate")),
        description: String(formData.get("description")),
        amount: Number(formData.get("amount")),
        pending: true,
      });
      const result = await addDonationForecast(previous, formData);
      return { ...result, resetKey: result.status === "success" ? previous.resetKey + 1 : previous.resetKey };
    },
    initialState,
  );

  return (
    <>
      <form key={state.resetKey} action={formAction} className="card-body border-t border-rule pt-5">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr] items-end">
          <div className="field"><label className="field-label" htmlFor="forecast-date">Expected date</label><input className="field-input" defaultValue={today} id="forecast-date" name="budgetDate" type="date" required /></div>
          <div className="field"><label className="field-label" htmlFor="forecast-description">Description</label><input className="field-input" id="forecast-description" maxLength={500} name="description" placeholder="Who or what is this expected gift from?" required /></div>
          <div className="field"><label className="field-label" htmlFor="forecast-amount">Planned amount</label><div className="money-input"><span>$</span><input className="field-input" id="forecast-amount" min="0.01" name="amount" placeholder="0.00" step="0.01" type="number" required /></div></div>
        </div>
        <div className="flex items-center justify-between gap-5 flex-wrap border-t border-rule mt-5 pt-4 min-h-[44px]">
          <div aria-live="polite">
            {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}
          </div>
          <Button variant="secondary" type="submit" disabled={pending}>{pending ? "Adding…" : "Add forecast"}</Button>
        </div>
      </form>
      {optimisticForecasts.length ? (
        <div className="table-scroll border-t border-rule">
          <table className="data-table">
            <thead><tr><th>Expected date</th><th>Description</th><th>Planned</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {optimisticForecasts.map((entry) => (
                <tr key={entry.id} className={entry.pending ? "opacity-60" : undefined}>
                  <td>{formatEntryDate(entry.budget_date)}</td>
                  <td>{entry.description}</td>
                  <td className="amount">{formatMoney(entry.amount)}</td>
                  <td className="text-right">
                    {entry.pending
                      ? <span className="text-[12px] text-muted">Saving…</span>
                      : <OptimisticDeleteButton action={deleteDonationForecast} value={entry.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
