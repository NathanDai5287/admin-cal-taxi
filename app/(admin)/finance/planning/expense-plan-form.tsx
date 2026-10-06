"use client";

import { useActionState, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/brand/button";
import { categories, formatMoney, type ReimbursementCategory } from "@/lib/reimbursements/format";

import { saveReimbursementBudgets, type ExpensePlanState } from "./actions";

const initialState: ExpensePlanState = { status: "idle", message: "" };

function saveForecastOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
}

type CategoryExpense = {
  category: ReimbursementCategory;
  planned: number;
  actual: number;
};

export function ExpensePlanForm({ budgets, completedCategories, expenses }: {
  budgets: Record<string, number | null>;
  completedCategories: ReimbursementCategory[];
  expenses: CategoryExpense[];
}) {
  const [state, formAction, pending] = useActionState(saveReimbursementBudgets, initialState);

  return (
    <form action={formAction} onKeyDown={saveForecastOnEnter} className="card-body border-t border-rule pt-5">
      <p className="mb-5 text-xs leading-relaxed text-muted">Mark complete when spending is finished. Expected expenses will use actual spending. Mark complete and Reopen also save your changes. Fire permits add to open Socials forecasts.</p>
      <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Category forecasts and completion</legend>
        {categories.map(([category, label]) => (
          <ExpenseCategoryField
            key={category}
            category={category}
            label={label}
            budget={budgets[category] ?? null}
            completed={completedCategories.includes(category)}
            expense={expenses.find((expense) => expense.category === category)!}
          />
        ))}
      </fieldset>
      <div className="mt-5 flex min-h-[44px] flex-wrap items-center justify-between gap-5 border-t border-rule pt-4">
        <div aria-live="polite">
          {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}
        </div>
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save expected expenses"}</Button>
      </div>
    </form>
  );
}

function ExpenseCategoryField({ category, label, budget, completed, expense }: {
  category: ReimbursementCategory;
  label: string;
  budget: number | null;
  completed: boolean;
  expense: CategoryExpense;
}) {
  const [expected, setExpected] = useState(budget?.toString() ?? "");
  const difference = expense.actual - expense.planned;
  const comparison = difference === 0 ? "On plan" : `${formatMoney(Math.abs(difference))} ${difference > 0 ? "over" : "under"} plan`;

  return (
    <div className="field min-w-0">
      <label className="field-label" htmlFor={`budget-${category}`}>{label}{completed ? " · Completed" : ""} expected expense</label>
      <input name={category} type="hidden" value={expected} />
      {completed ? <input name={`completed-${category}`} type="hidden" value="on" /> : null}
      <div className="money-input">
        <span>$</span>
        <input className="field-input" id={`budget-${category}`} min="0" placeholder="No plan" step="0.01" type="number" value={completed ? expense.actual : expected} readOnly={completed} onChange={(event) => setExpected(event.target.value)} aria-describedby={`plan-${category}`} />
      </div>
      <p className="text-xs text-muted" id={`plan-${category}`}>Original plan {formatMoney(expense.planned)} · Actual {formatMoney(expense.actual)}</p>
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{comparison}</span>
        <Button compact variant="secondary" type="submit" name={completed ? "reopen-category" : "complete-category"} value={category} aria-label={`${completed ? "Reopen" : "Mark complete"} ${label}`}>{completed ? "Reopen" : "Mark complete"}</Button>
      </div>
    </div>
  );
}
