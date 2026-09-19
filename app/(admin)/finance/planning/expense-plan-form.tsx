"use client";

import { useActionState } from "react";

import { Button } from "@/components/brand/button";
import { categories } from "@/lib/reimbursements/format";

import { saveReimbursementBudgets, type ExpensePlanState } from "./actions";

const initialState: ExpensePlanState = { status: "idle", message: "" };

export function ExpensePlanForm({ budgets }: { budgets: Record<string, number | null> }) {
  const [state, formAction, pending] = useActionState(saveReimbursementBudgets, initialState);

  return (
    <form action={formAction} className="card-body border-t border-rule pt-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(([category, label]) => (
          <div className="field" key={category}>
            <label className="field-label" htmlFor={`budget-${category}`}>{label}</label>
            <div className="money-input"><span>$</span><input className="field-input" defaultValue={budgets[category] ?? ""} id={`budget-${category}`} min="0" name={category} placeholder="No plan" step="0.01" type="number" /></div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex min-h-[44px] flex-wrap items-center justify-between gap-5 border-t border-rule pt-4">
        <div aria-live="polite">
          {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}
        </div>
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save expense plan"}</Button>
      </div>
    </form>
  );
}
