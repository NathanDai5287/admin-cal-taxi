"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateDuesPaymentPlan } from "./actions";
import type { DuesRow } from "./dues-board";
import { Button } from "@/components/brand/button";
import { paymentPlanDueDate, type PaymentPlanFrequency } from "@/lib/reimbursements/dues-payment-plan";

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
  const [startDate, setStartDate] = useState(row.paymentPlanStartDate ?? row.dueDate);
  const nextDueDate = enabled ? paymentPlanDueDate(startDate, { frequency, amount: Number(amount), intervalDays: frequency === "custom" ? Number(intervalDays) : null }, row.paidAmount, row.assessedAmount) : null;
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof updateDuesPaymentPlan>[0], data: FormData) => {
    const result = await updateDuesPaymentPlan(previous, data);
    if (result.status === "success") onSaved(`${result.message} ${row.memberName}'s balance updated.`);
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const busy = pending || row.pending || disabled || row.isPaid;

  return <form ref={formRef} action={action} className="dues-plan-form" aria-label={`Payment plan for ${row.memberName}`}>
    <input type="hidden" name="id" value={row.id} />
    <input type="hidden" name="updatedAt" value={row.updatedAt} />
    <label className="dues-plan-toggle">
      <input type="checkbox" name="paymentPlanEnabled" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />
      <span>Payment Plan</span>
    </label>
    <p className="text-xs text-muted">Payments advance the due date as each installment is covered. Changing the terms recalculates the schedule using all payments recorded.</p>
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
      <div className="field">
        <label className="field-label" htmlFor={`plan-start-${row.id}`}>First-installment date</label>
        <input className="field-input" id={`plan-start-${row.id}`} name="startDate" type="date" min="0001-01-01" max="9999-12-31" required value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
        <p className="text-xs text-muted">The schedule starts here, including installments already covered by recorded payments.</p>
      </div>
      <div className="dues-schedule-preview" aria-live="polite">
        <span>{row.isPaid ? "Final scheduled installment" : "Next payment due"}</span>
        <strong>{nextDueDate ? new Date(`${nextDueDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "Enter valid plan terms and date"}</strong>
        {row.isPaid && <p>No upcoming payment. This balance is fully paid.</p>}
      </div>
    </div>}
    {!enabled && <p className="text-xs text-muted">{row.paymentPlan ? "Removing this plan keeps the latest due date." : "No active payment plan."}</p>}
    {row.isPaid && <p className="text-xs text-muted">Reopen this balance in Payments to edit its plan.</p>}
    <div className="dues-plan-footer">
      <Button compact type="submit" variant="secondary" disabled={busy || (enabled && !nextDueDate) || (!enabled && !row.paymentPlan)}>{pending ? "Saving…" : !enabled && row.paymentPlan ? "Remove payment plan" : "Save payment plan"}</Button>
      <p aria-live="polite" className={`dues-action-feedback ${state.status}`}>{state.message}</p>
    </div>
  </form>;
}
