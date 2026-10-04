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
    <aside id="event-finances" className="scroll-mt-6 border-t border-rule pt-5 xl:border-t-0 xl:border-l xl:pl-7 xl:pt-0">
      <h2 className="text-lg font-semibold">Finances</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">Rental payment and fire permit are tracked independently. Sent events enter the forecast automatically.</p>
      {drifted && <p className="mt-4 text-[13px] text-warn">Saved terms changed after forecasting. The forecast keeps the original {formatMoney(revenue)} rental fee and {formatMoney(firePermit)} permit; recorded payments are retained.</p>}
      <div className="mt-6 space-y-7">
        {confirmed ? <PaymentForm busy={busy} defaultAmount={Math.max(revenue - revenuePaid, 0)} idPrefix="hosting-revenue" label="Rental fee" onSubmit={(data) => recordPayment("revenue", data)} paid={revenuePaid} today={today} total={revenue} /> : <div><h3 className="text-sm font-semibold">Rental fee</h3><p className="mt-2 text-sm text-muted">{formatMoney(revenuePaid)} of {formatMoney(revenue)} received</p></div>}
        {firePermit > 0 ? confirmed ? <PaymentForm busy={busy} defaultAmount={Math.max(firePermit - permitPaid, 0)} idPrefix="fire-permit" label="Fire permit" onSubmit={(data) => recordPayment("fire_permit", data)} paid={permitPaid} today={today} total={firePermit} /> : <div><h3 className="text-sm font-semibold">Fire permit</h3><p className="mt-2 text-sm text-muted">{formatMoney(permitPaid)} of {formatMoney(firePermit)} paid</p></div> : <div><h3 className="text-sm font-semibold">Fire permit</h3><p className="mt-2 text-sm text-muted">Not required for this event.</p></div>}
      </div>
      <p className="mt-4 text-[12px] text-muted">Fire permits are Socials expenses. Refundable deposits are excluded from revenue.</p>
      {!confirmed && <p className="mt-4 text-[13px] text-muted">{eventCancelled || financeOrder?.status === "cancelled" ? "This event is excluded from the forecast. Recorded payments remain below." : "Payment recording becomes available after the contract is sent and the forecast updates."}</p>}
      {displayPayments.length > 0 && <details className="mt-6 border-t border-rule pt-4"><summary className="cursor-pointer text-sm font-semibold">Payment history</summary><ul className="mt-3 divide-y divide-rule">{displayPayments.map(payment => <li key={payment.id} className="py-3 text-[13px]"><div className="flex justify-between gap-3"><strong>{payment.kind === "revenue" ? "Rental fee" : "Fire permit"}</strong><span className="tabular-nums">{formatMoney(payment.amount)}</span></div><p className="mt-1 text-muted">{payment.paidDate} · {payment.reversedAt ? "Reversed" : payment.pending ? "Recording…" : "Recorded"}</p>{!payment.reversedAt && !payment.pending && <Button compact variant="text" disabled={busy} onClick={() => reversePayment(payment.id)}>Reverse record</Button>}</li>)}</ul></details>}
      <p aria-live="polite" className="mt-3 text-[13px] [overflow-wrap:anywhere]">{message}</p>
    </aside>
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
  const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const paidInFull = total > 0 && paid >= total;
  return (
    <form action={onSubmit} className="grid content-start gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="card-title">{label}</span>
          <span className={`text-[12px] tabular-nums ${paidInFull ? "font-bold text-ok" : "text-muted"}`}>
            {paidInFull ? "Paid in full · " : ""}{formatMoney(paid)} of {formatMoney(total)}
          </span>
        </div>
        <div aria-hidden="true" className="mt-2 h-1.5 w-full bg-canvas">
          <div className={`h-full transition-[width] ${paidInFull ? "bg-ok" : "bg-brand"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-date`}>Date</label><input className="field-input" value={paidDate} onChange={e => setPaidDate(e.target.value)} id={`${idPrefix}-date`} name="paidDate" type="date" max={today} required /></div>
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-amount`}>Amount</label><div className="money-input"><span>$</span><input className="field-input" value={amount} onChange={e => setAmount(e.target.value)} id={`${idPrefix}-amount`} min="0.01" name="amount" step="0.01" type="number" required /></div></div>
        <Button className="sm:col-span-2" disabled={busy || paidInFull} type="submit" variant="secondary">{paidInFull ? "Paid in full" : "Record payment"}</Button>
      </div>
    </form>
  );
}
