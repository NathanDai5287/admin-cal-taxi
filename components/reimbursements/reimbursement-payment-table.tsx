"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  markReimbursementsPaid,
  updateReimbursed,
  updateStatus,
} from "@/app/(admin)/reimbursements/(review)/actions";
import { formatMoney, formatStatus } from "@/lib/reimbursements/format";
import { InlineStatusSelect } from "@/components/reimbursements/inline-status-select";
import { ReimbursedCheckbox } from "@/components/reimbursements/reimbursed-checkbox";

type ReimbursementStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "approved"
  | "denied"
  | "processing_failed";

export type PaymentTableRow = {
  amount: number;
  category: string;
  full_name: string;
  id: string;
  merchant: string | null;
  payment_method: string;
  receipt_total: number | null;
  reimbursed: boolean;
  status: ReimbursementStatus;
  submitted_at: string;
  updated_at: string;
};

type PaymentGroup = {
  cents: number;
  count: number;
  fullName: string;
  nameKey: string;
  paymentMethods: string[];
};

function amountInCents(amount: number) {
  return Math.round(Number(amount) * 100);
}

// Submissions are anonymous, so payments are grouped by normalized name.
function nameKeyOf(fullName: string) {
  return fullName.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function isPayable(row: PaymentTableRow) {
  return row.status === "approved" && !row.reimbursed;
}

export function ReimbursementPaymentTable({ rows }: { rows: PaymentTableRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The approved, unpaid rows for the member currently being paid.
  const [paymentRows, setPaymentRows] = useState<PaymentTableRow[]>([]);
  const [feedback, setFeedback] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const paymentTotalCents = useMemo(
    () => paymentRows.reduce((total, row) => total + amountInCents(row.amount), 0),
    [paymentRows],
  );
  const paymentGroups = useMemo(() => {
    const groups = new Map<string, PaymentGroup & { methodSet: Set<string> }>();

    for (const row of paymentRows) {
      const paymentMethod = row.payment_method.trim();
      const nameKey = nameKeyOf(row.full_name);
      const existing = groups.get(nameKey);
      if (existing) {
        existing.cents += amountInCents(row.amount);
        existing.count += 1;
        if (paymentMethod) existing.methodSet.add(paymentMethod);
        continue;
      }

      const methodSet = new Set<string>();
      if (paymentMethod) methodSet.add(paymentMethod);
      groups.set(nameKey, {
        cents: amountInCents(row.amount),
        count: 1,
        fullName: row.full_name,
        methodSet,
        nameKey,
        paymentMethods: [],
      });
    }

    return [...groups.values()].map(({ methodSet, ...group }) => ({
      ...group,
      paymentMethods: [...methodSet],
    }));
  }, [paymentRows]);

  // Paying is per member (one Zelle payment per person): the dialog collects
  // every approved, unpaid expense for that member so they are paid together.
  function openMemberPayment(row: PaymentTableRow) {
    const nameKey = nameKeyOf(row.full_name);
    setPaymentRows(rows.filter((item) => isPayable(item) && nameKeyOf(item.full_name) === nameKey));
    setDialogError("");
    dialogRef.current?.showModal();
  }

  function closeReviewDialog() {
    if (!submitting) dialogRef.current?.close();
  }

  async function confirmPayments() {
    if (!paymentRows.length || submitting) return;
    setSubmitting(true);
    setDialogError("");

    try {
      const result = await markReimbursementsPaid(paymentRows.map((row) => row.id));
      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      dialogRef.current?.close();
      setPaymentRows([]);
      setFeedback(result.skippedIds.length
        ? `${result.updatedIds.length} marked reimbursed; ${result.skippedIds.length} skipped because they were no longer eligible.`
        : `${result.updatedIds.length} ${result.updatedIds.length === 1 ? "reimbursement" : "reimbursements"} marked reimbursed.`);
      router.refresh();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Unable to mark the selected reimbursements as paid.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header"><span className="card-title">All submissions</span></div>
      <div className="table-scroll border-t border-rule">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th><th>Expense</th><th>Requested</th><th>Receipt total</th><th>Status</th><th>Reimbursed</th><th>Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const payable = isPayable(item);
              return (
                <tr className="submission-row" key={item.id}>
                  <td>
                    <Link
                      aria-label={`Review submission from ${item.full_name}`}
                      className="submission-link"
                      href={`/reimbursements/${item.id}`}
                    >
                      {item.full_name}
                    </Link>
                    <div className="row-meta">{new Date(item.submitted_at).toLocaleDateString()}</div>
                  </td>
                  <td>{item.merchant || formatStatus(item.category)}</td>
                  <td className="amount">{formatMoney(item.amount)}</td>
                  <td className="amount">{item.receipt_total === null ? "—" : formatMoney(item.receipt_total)}</td>
                  <td>
                    <form action={updateStatus} className="inline-action">
                      <input name="id" type="hidden" value={item.id} />
                      <InlineStatusSelect status={item.status} />
                    </form>
                  </td>
                  <td>
                    <form action={updateReimbursed} className="inline-action">
                      <input name="id" type="hidden" value={item.id} />
                      <ReimbursedCheckbox key={`${item.id}:${item.reimbursed}`} reimbursed={item.reimbursed} />
                    </form>
                  </td>
                  <td>
                    {payable ? (
                      <button
                        aria-label={`Pay all approved expenses for ${item.full_name}`}
                        className="btn-primary btn-compact inline-action"
                        onClick={() => openMemberPayment(item)}
                        title={`Review payment for ${item.full_name}`}
                        type="button"
                      >
                        Pay
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {feedback && <p className="payment-feedback" role="status">{feedback}</p>}

      <dialog
        aria-labelledby="payment-review-heading"
        className="payment-review-dialog"
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeReviewDialog();
        }}
        ref={dialogRef}
      >
        <div className="payment-review-heading">
          <div>
            <p className="page-eyebrow m-0">Payment review</p>
            <h2 id="payment-review-heading">Confirm reimbursement</h2>
          </div>
          <button aria-label="Close payment review" className="payment-review-close" disabled={submitting} onClick={closeReviewDialog} type="button">×</button>
        </div>

        <div className="payment-group-list">
          {paymentGroups.map((group) => (
            <section className="payment-group" key={group.nameKey}>
              <div className="payment-group-summary">
                <div>
                  <h3>{group.fullName}</h3>
                  <span>{group.count} {group.count === 1 ? "reimbursement" : "reimbursements"}</span>
                </div>
                <strong>{formatMoney(group.cents / 100)}</strong>
              </div>
              <div className="payment-group-methods">
                <span>Zelle phone number or email</span>
                {group.paymentMethods.length
                  ? group.paymentMethods.map((method) => <strong key={method}>{method}</strong>)
                  : <strong>Not provided</strong>}
              </div>
              {group.paymentMethods.length > 1 && (
                <p className="payment-method-warning">Multiple Zelle destinations were submitted. Verify the destination before sending payment.</p>
              )}
            </section>
          ))}
        </div>

        <div className="payment-review-total">
          <span>Grand total</span>
          <strong>{formatMoney(paymentTotalCents / 100)}</strong>
        </div>
        <p className="payment-review-note">This records the selected items as reimbursed. It does not send money through Zelle.</p>
        {dialogError && <p className="payment-dialog-error" role="alert">{dialogError}</p>}
        <div className="payment-review-actions">
          <button className="btn-ghost" disabled={submitting} onClick={closeReviewDialog} type="button">Cancel</button>
          <button className="btn-primary" disabled={submitting || !paymentRows.length} onClick={confirmPayments} type="button">
            {submitting ? "Marking reimbursed…" : "Mark as reimbursed"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
