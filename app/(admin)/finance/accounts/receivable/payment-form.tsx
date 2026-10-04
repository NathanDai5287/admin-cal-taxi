"use client";

import { useActionState, useState } from "react";
import { addDuesPayment } from "./actions";
import type { DuesRow } from "./dues-board";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";

export function DuesPaymentForm({ row, today, onRecorded }: { row: DuesRow; today: string; onRecorded: (message: string) => void }) {
  const [amount, setAmount] = useState("");
  const [requestId, setRequestId] = useState(row.paymentRequestId);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof addDuesPayment>[0], data: FormData) => {
    const result = await addDuesPayment(previous, data);
    if (result.status === "success") {
      onRecorded(`Payment of ${formatMoney(Number(data.get("paymentAmount")))} recorded for ${row.memberName}.`);
      setAmount("");
      setRequestId(crypto.randomUUID());
    }
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const cents = Math.round(Number(amount) * 100);
  const remainingCents = Math.round(row.amountOwed * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= remainingCents;

  return <form action={action} className="dues-payment-entry" aria-label={`Record payment for ${row.memberName}`}>
    <input type="hidden" name="id" value={row.id} />
    <input type="hidden" name="requestId" value={requestId} />
    <div className="field">
      <label className="field-label" htmlFor={`payment-amount-${row.id}`}>Amount received</label>
      <div className="money-input"><span>$</span><input autoFocus className="field-input" id={`payment-amount-${row.id}`} name="paymentAmount" type="number" min="0.01" max={row.amountOwed} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={pending || row.pending || row.isPaid} /></div>
      {!row.isPaid && <button className="dues-text-action" type="button" disabled={pending || row.pending} onClick={() => setAmount(row.amountOwed.toFixed(2))}>Use remaining balance · {formatMoney(row.amountOwed)}</button>}
    </div>
    <div className="field">
      <label className="field-label" htmlFor={`payment-date-${row.id}`}>Payment date</label>
      <input className="field-input" id={`payment-date-${row.id}`} name="paymentDate" type="date" defaultValue={today} required disabled={pending || row.pending || row.isPaid} />
    </div>
    <div className="dues-payment-result">
      <p aria-live="polite">{row.isPaid ? "This charge is fully paid." : valid ? `After this ${formatMoney(cents / 100)} payment, ${formatMoney((remainingCents - cents) / 100)} will remain due.` : "Enter the amount received toward this charge."}</p>
      <Button compact type="submit" disabled={!valid || pending || row.pending || row.isPaid}>Record payment</Button>
    </div>
    {state.status === "error" && <p role="status" className="dues-action-feedback error sm:col-span-2">{state.message}</p>}
  </form>;
}
