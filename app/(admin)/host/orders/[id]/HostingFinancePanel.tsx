"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";
import { recordHostingPaymentAction, reverseHostingPaymentAction } from "../actions";

type FinanceOrder = {
  status: "confirmed" | "cancelled";
  plannedRevenue: number;
  plannedFirePermit: number;
};

type Payment = {
  id: string;
  kind: "revenue" | "fire_permit";
  amount: number;
  paidDate: string;
  reversedAt: string | null;
};

export default function HostingFinancePanel({
  orderId,
  previewRevenue,
  previewFirePermit,
  financeOrder,
  payments,
  today,
  eventCancelled = false,
}: {
  orderId: string;
  previewRevenue: number;
  previewFirePermit: number;
  financeOrder: FinanceOrder | null;
  payments: Payment[];
  today: string;
  eventCancelled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Payment["kind"] | null>(null);
  const [requestIds, setRequestIds] = useState({
    revenue: crypto.randomUUID(),
    fire_permit: crypto.randomUUID(),
  });
  const revenue = financeOrder?.plannedRevenue ?? previewRevenue;
  const firePermit = financeOrder?.plannedFirePermit ?? previewFirePermit;

  // Optimistic overrides: the UI flips instantly on click and only rolls back
  // if the server action fails. The parent remounts this panel when refreshed
  // finance data changes, clearing these local overrides before paint.
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [reversedIds, setReversedIds] = useState<ReadonlySet<string>>(new Set());

  const confirmed = financeOrder?.status === "confirmed" && !eventCancelled;
  const displayPayments: (Payment & { pending?: boolean })[] = [
    ...pendingPayments.map((payment) => ({ ...payment, pending: true })),
    ...payments.map((payment) => reversedIds.has(payment.id) ? { ...payment, reversedAt: new Date().toISOString() } : payment),
  ];
  // Drift: the archived order was edited after confirmation. The confirmed
  // values are the ledger of record and stay frozen; this note makes the
  // disagreement visible instead of silent.
  const drifted = confirmed && financeOrder
    && (financeOrder.plannedRevenue !== previewRevenue
      || financeOrder.plannedFirePermit !== previewFirePermit);
  const activePayments = displayPayments.filter((payment) => !payment.reversedAt);
  const revenuePaid = activePayments.filter((payment) => payment.kind === "revenue").reduce((total, payment) => total + payment.amount, 0);
  const permitPaid = activePayments.filter((payment) => payment.kind === "fire_permit").reduce((total, payment) => total + payment.amount, 0);

  async function recordPayment(kind: Payment["kind"], formData: FormData) {
    setBusy(true);
    setMessage("");
    const optimistic: Payment = {
      id: `pending-${crypto.randomUUID()}`,
      kind,
      amount: Number(formData.get("amount")),
      paidDate: String(formData.get("paidDate")),
      reversedAt: null,
    };
    setPendingPayments((current) => [optimistic, ...current]);
    try {
      const result = await recordHostingPaymentAction({
        orderId,
        kind,
        amount: optimistic.amount,
        paidDate: optimistic.paidDate,
        requestId: requestIds[kind],
      });
      if (result.ok) {
        setMessage("Payment recorded.");
        setRequestIds((current) => ({ ...current, [kind]: crypto.randomUUID() }));
        router.refresh();
      } else {
        setPendingPayments((current) => current.filter((payment) => payment.id !== optimistic.id));
        setMessage(result.error);
      }
    } catch {
      setPendingPayments(current => current.filter(payment => payment.id !== optimistic.id));
      setMessage("Could not confirm the payment. Retry with the same details; the payment will be recorded only once.");
    } finally { setBusy(false); }
  }

  async function reversePayment(paymentId: string) {
    if (!window.confirm("Reverse this payment record?")) return;
    setBusy(true);
    setMessage("");
    setReversedIds((current) => new Set(current).add(paymentId));
    try {
      const result = await reverseHostingPaymentAction(paymentId);
      if (result.ok) {
        setMessage("Payment reversed.");
        router.refresh();
      } else {
        setReversedIds((current) => {
          const next = new Set(current);
          next.delete(paymentId);
          return next;
        });
        setMessage(result.error);
      }
    } catch {
      setReversedIds(current => { const next = new Set(current); next.delete(paymentId); return next; });
      setMessage("Could not confirm the reversal. Reload to check the payment, then retry if needed.");
    } finally { setBusy(false); }
  }

  return (
    <section id="event-finances" aria-label="Event finances" className="scroll-mt-6 border-y border-rule py-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <h2 className="text-[13px] font-semibold">Finances</h2>
        <div className="flex flex-wrap items-center gap-3"><span className="text-[13px]">Rental fee <span className="ml-2 tabular-nums text-muted">{formatMoney(revenuePaid)} / {formatMoney(revenue)}</span></span><Button compact variant="text" disabled={busy || !confirmed || revenuePaid >= revenue} onClick={() => setEditing(editing === "revenue" ? null : "revenue")}>{revenuePaid >= revenue && revenue > 0 ? "Paid" : editing === "revenue" ? "Close" : "Record payment"}</Button></div>
        <div className="flex flex-wrap items-center gap-3"><span className="text-[13px]">Fire permit <span className="ml-2 tabular-nums text-muted">{firePermit > 0 ? `${formatMoney(permitPaid)} / ${formatMoney(firePermit)}` : "Not required"}</span></span>{firePermit > 0 && <Button compact variant="text" disabled={busy || !confirmed || permitPaid >= firePermit} onClick={() => setEditing(editing === "fire_permit" ? null : "fire_permit")}>{permitPaid >= firePermit ? "Paid" : editing === "fire_permit" ? "Close" : "Record payment"}</Button>}</div>
      </div>
      {editing && confirmed && <div className="mt-4 max-w-2xl"><PaymentForm key={editing} busy={busy} defaultAmount={Math.max(editing === "revenue" ? revenue - revenuePaid : firePermit - permitPaid, 0)} idPrefix={editing === "revenue" ? "hosting-revenue" : "fire-permit"} label={editing === "revenue" ? "Rental fee" : "Fire permit"} onSubmit={data => recordPayment(editing, data)} paid={editing === "revenue" ? revenuePaid : permitPaid} total={editing === "revenue" ? revenue : firePermit} today={today} /></div>}
      {drifted && <p className="mt-3 text-[12px] text-warn">Saved terms changed. The forecast retains {formatMoney(revenue)} rental and {formatMoney(firePermit)} permit; recorded payments remain.</p>}
      {!confirmed && <p className="mt-2 text-[12px] text-muted">{eventCancelled || financeOrder?.status === "cancelled" ? "Event cancelled. Payment history retained." : "Record payments after the contract is sent."}</p>}
      {displayPayments.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[12px] text-muted">Payment history</summary><ul className="mt-3 divide-y divide-rule">{displayPayments.map(payment => <li key={payment.id} className="py-3 text-[13px]"><div className="flex justify-between gap-3"><strong>{payment.kind === "revenue" ? "Rental fee" : "Fire permit"}</strong><span className="tabular-nums">{formatMoney(payment.amount)}</span></div><p className="mt-1 text-muted">{payment.paidDate} · {payment.reversedAt ? "Reversed" : payment.pending ? "Recording…" : "Recorded"}</p>{!payment.reversedAt && !payment.pending && <Button compact variant="text" disabled={busy} onClick={() => reversePayment(payment.id)}>Reverse record</Button>}</li>)}</ul></details>}
      {message && <p role="status" aria-live="polite" className="mt-2 text-[13px] [overflow-wrap:anywhere]">{message}</p>}
    </section>
  );
}

function PaymentForm({ busy, defaultAmount, idPrefix, label, onSubmit, paid, today, total }: {
  busy: boolean;
  defaultAmount: number;
  idPrefix: string;
  label: string;
  onSubmit: (formData: FormData) => void;
  paid: number;
  today: string;
  total: number;
}) {
  const [paidDate, setPaidDate] = useState(today);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const paidInFull = total > 0 && paid >= total;
  return (
    <form action={onSubmit} className="grid content-start gap-3">
      <span className="sr-only">Record {label} payment</span>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-date`}>Date</label><input className="field-input" value={paidDate} onChange={e => setPaidDate(e.target.value)} id={`${idPrefix}-date`} name="paidDate" type="date" max={today} required /></div>
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-amount`}>Amount</label><div className="money-input"><span>$</span><input className="field-input" value={amount} onChange={e => setAmount(e.target.value)} id={`${idPrefix}-amount`} min="0.01" name="amount" step="0.01" type="number" required /></div></div>
        <Button compact disabled={busy || paidInFull} type="submit" variant="secondary">{paidInFull ? "Paid in full" : "Record payment"}</Button>
      </div>
    </form>
  );
}
