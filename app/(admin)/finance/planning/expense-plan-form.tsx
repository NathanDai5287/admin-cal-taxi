"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/brand/button";
import { categories, formatMoney, type ReimbursementCategory } from "@/lib/reimbursements/format";

import { saveReimbursementBudgets, type ExpensePlanState } from "./actions";
import styles from "./expense-plan-form.module.css";

const initialState: ExpensePlanState = { status: "idle", message: "" };

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
  const [plannedAmounts, setPlannedAmounts] = useState(Object.fromEntries(categories.map(([category]) => [category, budgets[category]?.toString() ?? ""])));
  const [completed, setCompleted] = useState(completedCategories);
  const expectedTotal = expenses.reduce((total, expense) => {
    if (completed.includes(expense.category)) return total + expense.actual;
    const additionalPlan = expense.planned - (budgets[expense.category] ?? 0);
    return total + Math.max(Number(plannedAmounts[expense.category]) + additionalPlan, expense.actual);
  }, 0);

  async function saveCompletion(category: ReimbursementCategory, nextCompleted: boolean) {
    setCompleted((current) => nextCompleted ? [...current, category] : current.filter((value) => value !== category));
    let result: ExpensePlanState;
    try {
      const response = await fetch("/api/finance/category-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, completed: nextCompleted }),
      });
      result = await response.json();
    } catch {
      result = { status: "error", message: "Could not save this category. Try again." };
    }
    if (result.status === "error") setCompleted((current) => nextCompleted ? current.filter((value) => value !== category) : [...current, category]);
    return result;
  }

  return (
    <form action={formAction} className="card-body border-t border-rule">
      <table className={styles.table}>
        <caption className="sr-only">Editable planned expenses and actual spending by category</caption>
        <thead><tr><th scope="col">Category</th><th scope="col">Planned</th><th scope="col">Actual</th><th scope="col"><span className="sr-only">Completion</span></th></tr></thead>
        <tbody>
          {categories.map(([category, label]) => (
            <ExpenseCategoryRow
              key={category}
              category={category}
              label={label.toLowerCase()}
              planned={plannedAmounts[category]}
              actual={expenses.find((expense) => expense.category === category)!.actual}
              completed={completed.includes(category)}
              onPlanChange={(value) => setPlannedAmounts((current) => ({ ...current, [category]: value }))}
              onCompletionChange={saveCompletion}
            />
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
        <p className="text-xs text-muted">Completed categories use actual spending in the total.</p>
        <p className="text-sm font-semibold">Expected expenses <span className="ml-3 tabular-nums" aria-live="polite">{formatMoney(expectedTotal)}</span></p>
      </div>
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-4 pt-4">
        <div className="max-w-xl text-xs leading-relaxed text-muted">
          <p>You can change the plan at any time. Fire permits add to the Socials forecast.</p>
          <div aria-live="polite">{state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"}>{state.message}</p> : null}</div>
        </div>
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving plans…" : "Save plans"}</Button>
      </div>
    </form>
  );
}

function ExpenseCategoryRow({ category, label, planned, actual, completed, onPlanChange, onCompletionChange }: {
  category: ReimbursementCategory;
  label: string;
  planned: string;
  actual: number;
  completed: boolean;
  onPlanChange: (value: string) => void;
  onCompletionChange: (category: ReimbursementCategory, completed: boolean) => Promise<ExpensePlanState>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleCompletion() {
    setSaving(true);
    setMessage("");
    const result = await onCompletionChange(category, !completed);
    if (result.status === "error") setMessage(result.message);
    setSaving(false);
  }

  return (
    <tr>
      <th scope="row"><span className={styles.category}>{label}</span><span className={styles.status} aria-live="polite">{saving ? "Saving…" : completed ? "Completed" : ""}</span>{message ? <p className={styles.error} role="alert">{message}</p> : null}</th>
      <td data-label="Planned" className={styles.planned}>
        <div className="money-input"><span>$</span><input className="field-input" id={`budget-${category}`} name={category} aria-label={`Planned expense for ${label}`} min="0" max="999999999.99" placeholder="No plan" step="0.01" type="number" value={planned} onChange={(event) => onPlanChange(event.target.value)} /></div>
      </td>
      <td data-label="Actual">{formatMoney(actual)}</td>
      <td className={styles.action}><button type="button" className={styles.complete} disabled={saving} aria-label={`${completed ? "Reopen" : "Complete"} ${label}`} aria-busy={saving} onClick={toggleCompletion}>{completed ? "Reopen" : "Complete"}</button></td>
    </tr>
  );
}
