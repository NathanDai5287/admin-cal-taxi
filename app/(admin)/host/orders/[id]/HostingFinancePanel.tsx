"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";
import { cancelHostingContractAction, confirmHostingContractAction, recordHostingPaymentAction, reverseHostingPaymentAction } from "../actions";

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
}: {
  orderId: string;
  previewRevenue: number;
  previewFirePermit: number;
  financeOrder: FinanceOrder | null;
  payments: Payment[];
  today: string;
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
  const confirmed = financeOrder?.status === "confirmed";
  // Drift: the archived order was edited after confirmation. The confirmed
  // values are the ledger of record and stay frozen; this note makes the
  // disagreement visible instead of silent.
  const drifted = confirmed && financeOrder
    && (financeOrder.plannedRevenue !== previewRevenue
      || financeOrder.plannedFirePermit !== previewFirePermit);
  const activePayments = payments.filter((payment) => !payment.reversedAt);
  const revenuePaid = activePayments.filter((payment) => payment.kind === "revenue").reduce((total, payment) => total + payment.amount, 0);
  const permitPaid = activePayments.filter((payment) => payment.kind === "fire_permit").reduce((total, payment) => total + payment.amount, 0);

  async function confirmContract() {
    setBusy(true);
    setMessage("");
    const result = await confirmHostingContractAction(orderId);
    setBusy(false);
    setMessage(result.ok ? "Contract confirmed in the finance plan." : result.error);
    if (result.ok) router.refresh();
  }

  async function cancelContract() {
    if (!window.confirm("Cancel this contract and remove its planned values? Recorded payments will remain.")) return;
    setBusy(true);
    setMessage("");
    const result = await cancelHostingContractAction(orderId);
    setBusy(false);
    setMessage(result.ok ? "Contract cancelled. Recorded payments remain in actual totals." : result.error);
    if (result.ok) router.refresh();
  }

  async function recordPayment(kind: Payment["kind"], formData: FormData) {
    setBusy(true);
    setMessage("");
    const result = await recordHostingPaymentAction({
      orderId,
      kind,
      amount: Number(formData.get("amount")),
      paidDate: String(formData.get("paidDate")),
      requestId: requestIds[kind],
    });
    setBusy(false);
    setMessage(result.ok ? "Payment recorded." : result.error);
    if (result.ok) {
      setRequestIds((current) => ({ ...current, [kind]: crypto.randomUUID() }));
      router.refresh();
    }
  }

  async function reversePayment(paymentId: string) {
    if (!window.confirm("Reverse this payment record?")) return;
    setBusy(true);
    setMessage("");
    const result = await reverseHostingPaymentAction(paymentId);
    setBusy(false);
    setMessage(result.ok ? "Payment reversed." : result.error);
    if (result.ok) router.refresh();
  }

  return (
    <section className="card" aria-labelledby="hosting-finance-title">
      <div className="card-header">
        <span className="card-title" id="hosting-finance-title">Plan and payments</span>
        <span className="card-subtitle">Confirm the contract before these values enter Finance Planning.</span>
      </div>
      <div className="card-body grid gap-5">
        <div className="grid gap-px bg-rule sm:grid-cols-2">
          <div className="bg-surface p-4"><span className="field-label">Rental revenue</span><strong className="mt-1 block text-[20px] tabular-nums">{formatMoney(revenue)}</strong></div>
          <div className="bg-surface p-4"><span className="field-label">Fire permit expense</span><strong className="mt-1 block text-[20px] tabular-nums">{formatMoney(firePermit)}</strong></div>
        </div>

        {drifted ? (
          <p className="border border-rule px-3 py-2 text-[12.5px] text-warn">
            The order has changed since confirmation — it now reads {formatMoney(previewRevenue)} revenue
            and {formatMoney(previewFirePermit)} fire permit. The plan keeps the confirmed values
            above; cancel and re-confirm to move the plan to the new numbers.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
          {confirmed ? null : (
            <p className="text-sm text-muted">
              {financeOrder ? "This contract is cancelled and is not in the plan." : "Refundable deposits are excluded."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || revenue <= 0} onClick={confirmContract} type="button" variant="primary">
              {confirmed ? "Contract confirmed" : financeOrder ? "Restore contract" : "Confirm contract"}
            </Button>
            {confirmed ? <Button disabled={busy} onClick={cancelContract} type="button" variant="danger">Cancel contract</Button> : null}
          </div>
        </div>

        {confirmed ? (
          <div className="grid gap-4 border-t border-rule pt-5 lg:grid-cols-2">
            <PaymentForm busy={busy} defaultAmount={Math.max(revenue - revenuePaid, 0)} idPrefix="hosting-revenue" label="Record hosting payment" onSubmit={(data) => recordPayment("revenue", data)} paid={revenuePaid} today={today} />
            {firePermit > 0 ? <PaymentForm busy={busy} defaultAmount={Math.max(firePermit - permitPaid, 0)} idPrefix="fire-permit" label="Record fire-permit payment" onSubmit={(data) => recordPayment("fire_permit", data)} paid={permitPaid} today={today} /> : <p className="text-sm text-muted">This contract has no fire-permit expense.</p>}
          </div>
        ) : null}
        {payments.length ? (
          <div className="table-scroll border-t border-rule pt-4">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Payment</th><th>Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{new Date(`${payment.paidDate}T12:00:00`).toLocaleDateString("en-US")}</td>
                  <td>{payment.kind === "revenue" ? "Hosting revenue" : "Fire permit"}</td>
                  <td className="amount">{formatMoney(payment.amount)}</td>
                  <td>{payment.reversedAt ? "Reversed" : "Recorded"}</td>
                  <td className="text-right">{payment.reversedAt ? null : <Button compact disabled={busy} onClick={() => reversePayment(payment.id)} type="button" variant="text">Reverse</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        <p aria-live="polite" className="form-message">{message}</p>
      </div>
    </section>
  );
}

function PaymentForm({ busy, defaultAmount, idPrefix, label, onSubmit, paid, today }: {
  busy: boolean;
  defaultAmount: number;
  idPrefix: string;
  label: string;
  onSubmit: (formData: FormData) => void;
  paid: number;
  today: string;
}) {
  return (
    <form action={onSubmit} className="grid gap-3">
      <div><span className="card-title">{label}</span><p className="mt-1 text-[12px] text-muted">Recorded: {formatMoney(paid)}</p></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-date`}>Date</label><input className="field-input" defaultValue={today} id={`${idPrefix}-date`} name="paidDate" type="date" required /></div>
        <div className="field"><label className="field-label" htmlFor={`${idPrefix}-amount`}>Amount</label><div className="money-input"><span>$</span><input className="field-input" defaultValue={defaultAmount || ""} id={`${idPrefix}-amount`} min="0.01" name="amount" step="0.01" type="number" required /></div></div>
      </div>
      <Button disabled={busy} type="submit" variant="secondary">Record payment</Button>
    </form>
  );
}
