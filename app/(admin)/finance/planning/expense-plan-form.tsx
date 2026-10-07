"use client";

import { useActionState, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/brand/button";
import { categories, formatMoney, type ReimbursementCategory } from "@/lib/reimbursements/format";

import { saveReimbursementBudgets, type ExpensePlanState } from "./actions";
import styles from "./expense-plan-form.module.css";

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
    <form action={formAction} onKeyDown={saveForecastOnEnter} className="card-body border-t border-rule">
      <fieldset disabled={pending} className="min-w-0">
        <legend className="sr-only">Category forecasts and completion</legend>
        <table className={styles.table}>
          <caption className="sr-only">Expense forecasts compared with original plans and actual spending</caption>
          <thead><tr><th scope="col">Category</th><th scope="col">Original plan</th><th scope="col">Expected</th><th scope="col">Actual</th><th scope="col">Difference</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {categories.map(([category, label]) => (
              <ExpenseCategoryField
                key={category}
                category={category}
                label={label.toLowerCase()}
                budget={budgets[category] ?? null}
                completed={completedCategories.includes(category)}
                expense={expenses.find((expense) => expense.category === category)!}
              />
            ))}
          </tbody>
        </table>
      </fieldset>
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-4 pt-4">
        <div className="max-w-xl text-xs leading-relaxed text-muted">
          <p>Completed categories use actual spending. Actions also save your changes.</p>
          <p>Fire permits add to the Socials plan and its open forecast.</p>
          <div aria-live="polite">{state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}</div>
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
  const comparison = difference === 0 ? "On plan" : `${formatMoney(Math.abs(difference))} ${difference > 0 ? "over" : "under"}`;

  return (
    <tr>
      <th scope="row"><span className={styles.category}>{label}</span>{completed ? <span className={styles.status}>Completed</span> : null}</th>
      <td data-label="Original plan">{formatMoney(expense.planned)}</td>
      <td data-label="Expected" className={styles.expected}>
        <input name={category} type="hidden" value={expected} />
        {completed ? <><input name={`completed-${category}`} type="hidden" value="on" /><span>{formatMoney(expense.actual)}</span></> : (
          <div className="money-input">
            <span>$</span>
            <input className="field-input" id={`budget-${category}`} aria-label={`Expected expense for ${label}`} min="0" placeholder="No plan" step="0.01" type="number" value={expected} onChange={(event) => setExpected(event.target.value)} />
          </div>
        )}
      </td>
      <td data-label="Actual">{formatMoney(expense.actual)}</td>
      <td data-label="Difference" className={difference > 0 ? styles.over : styles.difference}>{comparison}</td>
      <td className={styles.action}><Button variant="text" type="submit" name={completed ? "reopen-category" : "complete-category"} value={category} aria-label={`${completed ? "Reopen" : "Mark complete"} ${label}`}>{completed ? "Reopen" : "Mark complete"}</Button></td>
    </tr>
  );
}
