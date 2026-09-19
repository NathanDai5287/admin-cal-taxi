"use client";

import { useActionState } from "react";

import { Button } from "@/components/brand/button";

import { saveOpeningCash, type ActivityActionState } from "./actions";

const initialState: ActivityActionState = { status: "idle", message: "" };

export function OpeningCashForm({ openingCash }: { openingCash: number }) {
  const [state, formAction, pending] = useActionState(saveOpeningCash, initialState);

  return (
    <form action={formAction} className="card-body grid gap-4">
      <div className="max-w-[360px] field">
        <label className="field-label" htmlFor="opening-cash-amount">Cash at the start of the current term</label>
        <div className="money-input"><span>$</span><input className="field-input" id="opening-cash-amount" name="openingCash" type="number" min="0" step="0.01" defaultValue={openingCash} required /></div>
        <p className="field-hint">Change this only when correcting the starting balance. Day-to-day income and expenses belong above.</p>
      </div>
      <div aria-live="polite">
        {state.message ? <p className={state.status === "success" ? "form-message success" : "form-message"} role="status">{state.message}</p> : null}
      </div>
      <Button variant="secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save opening cash"}</Button>
    </form>
  );
}
