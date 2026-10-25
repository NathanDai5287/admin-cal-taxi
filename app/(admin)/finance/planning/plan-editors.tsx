"use client";

import { useActionState, useState, useTransition } from "react";

import type { ReimbursementCategory } from "@/lib/reimbursements/format";

import { saveCategoryPlan, setExpenseCategoryCompleted, type ExpensePlanState } from "./actions";

const initialState: ExpensePlanState = { status: "idle", message: "" };

export function CategoryMenu({ category, label, budget, completed }: {
  category: ReimbursementCategory;
  label: string;
  budget: number | null;
  completed: boolean;
}) {
  const [panel, setPanel] = useState<"closed" | "menu" | "plan">("closed");
  const [message, setMessage] = useState("");
  const [toggling, startToggle] = useTransition();
  const [, savePlan, saving] = useActionState(async (previous: ExpensePlanState, formData: FormData) => {
    const result = await saveCategoryPlan(previous, formData);
    setMessage(result.status === "error" ? result.message : "");
    if (result.status === "success") setPanel("closed");
    return result;
  }, initialState);

  function toggleCompletion() {
    startToggle(async () => {
      const result = await setExpenseCategoryCompleted(category, !completed);
      setMessage(result.status === "error" ? result.message : "");
      setPanel("closed");
    });
  }

  return (
    <span className="plan-menu" onKeyDown={(event) => event.key === "Escape" && setPanel("closed")} onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && panel === "menu" && setPanel("closed")}>
      <button type="button" className="plan-menu-trigger" aria-label={`Options for ${label}`} aria-expanded={panel !== "closed"} aria-busy={toggling || saving} onClick={() => setPanel(panel === "closed" ? "menu" : "closed")}>
        {toggling || saving ? "…" : "⋯"}
      </button>
      {panel === "menu" ? (
        <span className="plan-menu-panel" role="menu">
          <button type="button" role="menuitem" onClick={() => setPanel("plan")}>Change plan</button>
          <button type="button" role="menuitem" onClick={toggleCompletion}>{completed ? "Reopen category" : "Mark complete"}</button>
        </span>
      ) : null}
      {panel === "plan" ? (
        <form action={savePlan} className="plan-menu-panel">
          <input type="hidden" name="category" value={category} />
          <label className="text-[11.5px] text-muted" htmlFor={`plan-${category}`}>Plan for {label}</label>
          <span className="money-input"><span>$</span><input autoFocus className="field-input" id={`plan-${category}`} name="amount" defaultValue={budget ?? ""} min="0" max="999999999.99" placeholder="No plan" step="0.01" type="number" /></span>
          <span className="flex gap-2"><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={() => setPanel("closed")}>Cancel</button></span>
        </form>
      ) : null}
      {message ? <span className="plan-menu-error" role="alert">{message}</span> : null}
    </span>
  );
}
