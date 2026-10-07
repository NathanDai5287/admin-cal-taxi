"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateDuesPaymentPlan } from "./actions";
import type { DuesRow } from "./dues-board";
import { Button } from "@/components/brand/button";
import type { PaymentPlanFrequency } from "@/lib/reimbursements/dues-payment-plan";

export function DuesPaymentPlanForm({ row, disabled, onSaved }: {
  row: DuesRow;
  disabled?: boolean;
  onSaved: (message: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const preserveEntry = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveEntry);
    return () => form.removeEventListener("reset", preserveEntry);
  }, []);
  const [enabled, setEnabled] = useState(Boolean(row.paymentPlan));
  const [frequency, setFrequency] = useState<PaymentPlanFrequency>(row.paymentPlan?.frequency ?? "monthly");
  const [amount, setAmount] = useState(row.paymentPlan?.amount.toFixed(2) ?? "");
  const [intervalDays, setIntervalDays] = useState(row.paymentPlan?.intervalDays?.toString() ?? "");
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof updateDuesPaymentPlan>[0], data: FormData) => {
    const result = await updateDuesPaymentPlan(previous, data);
    if (result.status === "success") onSaved(`${result.message} ${row.memberName}'s balance updated.`);
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const busy = pending || row.pending || disabled;

  return <form ref={formRef} action={action} className="dues-plan-form" aria-label={`Payment plan for ${row.memberName}`}>
    <input type="hidden" name="id" value={row.id} />
    <input type="hidden" name="updatedAt" value={row.updatedAt} />
    <label className="dues-plan-toggle">
      <input type="checkbox" name="paymentPlanEnabled" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />
      <span>Payment Plan</span>
    </label>
    <p className="text-xs text-muted">Set the amount and frequency agreed for this charge. Record each payment when received.</p>
    {enabled && <div className="dues-plan-fields">
      <div className="field">
        <label className="field-label" htmlFor={`plan-amount-${row.id}`}>Amount per payment</label>
        <div className="money-input"><span>$</span><input className="field-input" id={`plan-amount-${row.id}`} name="planAmount" type="number" min="0.01" max="999999999.99" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} placeholder="250.00" /></div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`plan-frequency-${row.id}`}>Payment frequency</label>
        <select className="field-input" id={`plan-frequency-${row.id}`} name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as PaymentPlanFrequency)} disabled={busy}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="custom">Custom interval</option>
        </select>
      </div>
      {frequency === "custom" && <div className="field">
        <label className="field-label" htmlFor={`plan-interval-${row.id}`}>Days between payments</label>
        <input className="field-input" id={`plan-interval-${row.id}`} name="intervalDays" type="number" min="1" max="2147483647" step="1" required value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} disabled={busy} />
      </div>}
    </div>}
    <div className="dues-plan-footer">
      <Button compact type="submit" variant="secondary" disabled={busy || (!enabled && !row.paymentPlan)}>{pending ? "Saving…" : !enabled && row.paymentPlan ? "Remove payment plan" : "Save payment plan"}</Button>
      <p aria-live="polite" className={`dues-action-feedback ${state.status}`}>{state.message}</p>
    </div>
  </form>;
}
