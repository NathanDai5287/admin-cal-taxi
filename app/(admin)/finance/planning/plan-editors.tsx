"use client";

import { useActionState, useState, useTransition } from "react";

import type { ReimbursementCategory } from "@/lib/reimbursements/format";

import { saveCategoryPlan, setExpenseCategoryCompleted, type ExpensePlanState } from "./actions";

const initialState: ExpensePlanState = { status: "idle", message: "" };

export function PlanAmountEditor({ category, label, budget, display }: {
  category: ReimbursementCategory;
  label: string;
  budget: number | null;
  display: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: ExpensePlanState, formData: FormData) => {
    const result = await saveCategoryPlan(previous, formData);
    if (result.status === "success") setEditing(false);
    return result;
  }, initialState);

  if (!editing) {
    return <button type="button" className="plan-edit" aria-label={`Change the plan for ${label}`} onClick={() => setEditing(true)}>{display}</button>;
  }
  return (
    <form action={formAction} className="plan-edit-form" onKeyDown={(event) => event.key === "Escape" && setEditing(false)}>
      <input type="hidden" name="category" value={category} />
      <span className="money-input"><span>$</span><input autoFocus className="field-input" name="amount" aria-label={`Planned expense for ${label}`} defaultValue={budget ?? ""} min="0" max="999999999.99" placeholder="No plan" step="0.01" type="number" /></span>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => setEditing(false)}>Cancel</button>
      {state.status === "error" ? <span className="plan-edit-error" role="alert">{state.message}</span> : null}
    </form>
  );
}

export function CompletionToggle({ category, label, completed }: { category: ReimbursementCategory; label: string; completed: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function toggle() {
    startTransition(async () => {
      const result = await setExpenseCategoryCompleted(category, !completed);
      setMessage(result.status === "error" ? result.message : "");
    });
  }

  return (
    <span className="plan-complete">
      {completed ? <span className="text-brand">Completed</span> : null}
      <button type="button" disabled={pending} aria-busy={pending} aria-label={`${completed ? "Reopen" : "Complete"} ${label}`} onClick={toggle}>{pending ? "Saving…" : completed ? "Reopen" : "Mark complete"}</button>
      {message ? <span className="plan-edit-error" role="alert">{message}</span> : null}
    </span>
  );
}
