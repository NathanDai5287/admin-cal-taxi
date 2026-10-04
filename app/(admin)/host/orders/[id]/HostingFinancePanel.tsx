"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";
import { recordHostingPaymentAction, undoHostingPaymentStatusAction } from "../actions";

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
  const displayPayments = [...pendingPayments, ...payments].map(payment => reversedIds.has(payment.id)
    ? { ...payment, reversedAt: "undone" } : payment);
  // Drift: the archived order was edited after confirmation. The confirmed
  // values are the ledger of record and stay frozen; this note makes the
  // disagreement visible instead of silent.
  const drifted = confirmed && financeOrder
    && (financeOrder.plannedRevenue !== previewRevenue
      || financeOrder.plannedFirePermit !== previewFirePermit);
  const activePayments = displayPayments.filter((payment) => !payment.reversedAt);
  const revenuePaid = activePayments.filter((payment) => payment.kind === "revenue").reduce((total, payment) => total + payment.amount, 0);
  const permitPaid = activePayments.filter((payment) => payment.kind === "fire_permit").reduce((total, payment) => total + payment.amount, 0);

  async function recordPayment(kind: Payment["kind"]) {
    setBusy(true);
    setMessage("");
    const optimistic: Payment = {
      id: `pending-${crypto.randomUUID()}`,
      kind,
      amount: Math.round(((kind === "revenue" ? revenue - revenuePaid : firePermit - permitPaid)) * 100) / 100,
      paidDate: today,
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
        setPendingPayments(current => current.map(payment => payment.id === optimistic.id ? { ...payment, id: result.data.id } : payment));
        setMessage(`${kind === "revenue" ? "Rental fee" : "Fire permit"} marked paid.`);
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

  async function undoPaid(kind: Payment["kind"]) {
    const paymentIds = activePayments.filter(payment => payment.kind === kind).map(payment => payment.id);
    setBusy(true);
    setMessage("");
    setReversedIds(current => new Set([...current, ...paymentIds]));
    try {
      const result = await undoHostingPaymentStatusAction({ orderId, kind, paymentIds });
      if (!result.ok) throw new Error(result.error);
      setMessage(`${kind === "revenue" ? "Rental fee" : "Fire permit"} marked unpaid.`);
      router.refresh();
    } catch (error) {
      setReversedIds(current => new Set([...current].filter(id => !paymentIds.includes(id))));
      setMessage(error instanceof Error ? error.message : "Could not undo paid status. Reload to check the payment, then retry.");
    } finally { setBusy(false); }
  }

  return (
    <section id="event-finances" aria-label="Event payments" className="scroll-mt-6 border-b border-rule pb-4">
      <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {([{ kind: "revenue", label: "Rental payment", total: revenue, paid: revenuePaid },
          { kind: "fire_permit", label: "Fire permit", total: firePermit, paid: permitPaid }] as const).map(item => {
          const paid = item.total > 0 && item.paid >= item.total;
          return <div key={item.kind} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-[13px]">
              <span className="font-medium">{item.label}</span>
              <span className="ml-2 tabular-nums text-muted">{item.total > 0 ? formatMoney(item.total) : "Not required"}</span>
              {item.total > 0 && <span className={`mt-1 flex items-center gap-1.5 text-[12px] ${paid ? "text-ok" : "text-muted"}`}>
                {paid && <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 8 3 3 7-7" /></svg>}
                {paid ? "Paid" : "Unpaid"}
              </span>}
            </div>
            {item.total > 0 && <Button compact variant={paid ? "text" : "secondary"} disabled={busy || (!paid && !confirmed)}
              aria-label={`${paid ? "Undo paid status for" : "Mark paid:"} ${item.label.toLowerCase()}`}
              onClick={() => paid ? undoPaid(item.kind) : recordPayment(item.kind)}>{paid ? "Undo paid" : "Mark paid"}</Button>}
            {item.total === 0 && item.paid > 0 && <Button compact variant="text" disabled={busy} onClick={() => undoPaid(item.kind)}>Undo paid</Button>}
          </div>;
        })}
      </div>
      {drifted && <p className="mt-3 text-[12px] text-warn">Saved terms changed. The forecast retains {formatMoney(revenue)} rental and {formatMoney(firePermit)} permit; recorded payments remain.</p>}
      {!confirmed && <p className="mt-2 text-[12px] text-muted">{eventCancelled || financeOrder?.status === "cancelled" ? "Event cancelled." : "Mark payments after the contract is sent."}</p>}
      {message && <p role="status" aria-live="polite" className="mt-2 text-[13px] [overflow-wrap:anywhere]">{message}</p>}
    </section>
  );
}
