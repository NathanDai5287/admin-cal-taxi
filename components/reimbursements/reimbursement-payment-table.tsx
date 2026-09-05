"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  markReimbursementsPaid,
  updateReimbursed,
  updateStatus,
} from "@/app/reimbursements/admin/actions";
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
  user_id: string;
};

type PaymentGroup = {
  cents: number;
  count: number;
  fullName: string;
  paymentMethods: string[];
  userId: string;
};

function amountInCents(amount: number) {
  return Math.round(Number(amount) * 100);
}

function selectionKey(row: PaymentTableRow) {
  return `${row.id}:${row.updated_at}`;
}

export function ReimbursementPaymentTable({ rows }: { rows: PaymentTableRow[] }) {
  const router = useRouter();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligibleRows = useMemo(
    () => rows.filter((row) => row.status === "approved" && !row.reimbursed),
    [rows],
  );
  const eligibleKeySet = useMemo(
    () => new Set(eligibleRows.map(selectionKey)),
    [eligibleRows],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => eligibleKeySet.has(selectionKey(row)) && selectedKeys.has(selectionKey(row))),
    [eligibleKeySet, rows, selectedKeys],
  );
  const selectedTotalCents = useMemo(
    () => selectedRows.reduce((total, row) => total + amountInCents(row.amount), 0),
    [selectedRows],
  );
  const paymentGroups = useMemo(() => {
    const groups = new Map<string, PaymentGroup & { methodSet: Set<string> }>();

    for (const row of selectedRows) {
      const paymentMethod = row.payment_method.trim();
      const existing = groups.get(row.user_id);
      if (existing) {
        existing.cents += amountInCents(row.amount);
        existing.count += 1;
        if (paymentMethod) existing.methodSet.add(paymentMethod);
        continue;
      }

      const methodSet = new Set<string>();
      if (paymentMethod) methodSet.add(paymentMethod);
      groups.set(row.user_id, {
        cents: amountInCents(row.amount),
        count: 1,
        fullName: row.full_name,
        methodSet,
        paymentMethods: [],
        userId: row.user_id,
      });
    }

    return [...groups.values()].map(({ methodSet, ...group }) => ({
      ...group,
      paymentMethods: [...methodSet],
    }));
  }, [selectedRows]);
  const allEligibleSelected = eligibleRows.length > 0
    && eligibleRows.every((row) => selectedKeys.has(selectionKey(row)));

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedRows.length > 0 && !allEligibleSelected;
  }, [allEligibleSelected, selectedRows.length]);

  function toggleRow(row: PaymentTableRow, checked: boolean) {
    setFeedback("");
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => eligibleKeySet.has(key)));
      const key = selectionKey(row);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll() {
    setFeedback("");
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => eligibleKeySet.has(key)));
      if (allEligibleSelected) {
        for (const row of eligibleRows) next.delete(selectionKey(row));
      } else {
        for (const row of eligibleRows) next.add(selectionKey(row));
      }
      return next;
    });
  }

  function openReviewDialog() {
    setDialogError("");
    dialogRef.current?.showModal();
  }

  function closeReviewDialog() {
    if (!submitting) dialogRef.current?.close();
  }

  async function confirmPayments() {
    if (!selectedRows.length || submitting) return;
    setSubmitting(true);
    setDialogError("");

    try {
      const result = await markReimbursementsPaid(selectedRows.map((row) => row.id));
      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      dialogRef.current?.close();
      setSelectedKeys(new Set());
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
    <section className="panel submission-payment-panel">
      <div className="panel-header"><h2>All submissions</h2></div>
      <div className="submission-table-scroll">
        <table className="admin-table reimbursement-payment-table">
          <thead>
            <tr>
              <th className="payment-select-cell">
                <label className="payment-select-heading">
                  <span>Pay</span>
                  <input
                    aria-label="Select all approved unpaid reimbursements"
                    checked={allEligibleSelected}
                    className="payment-select-checkbox"
                    disabled={!eligibleRows.length}
                    onChange={toggleAll}
                    ref={selectAllRef}
                    type="checkbox"
                  />
                </label>
              </th>
              <th>Member</th><th>Expense</th><th>Requested</th><th>Receipt total</th><th>Status</th><th>Reimbursed</th><th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const eligible = item.status === "approved" && !item.reimbursed;
              return (
                <tr className="submission-row" key={item.id}>
                  <td className="payment-select-cell">
                    <input
                      aria-label={eligible
                        ? `Select reimbursement from ${item.full_name} for ${formatMoney(item.amount)}`
                        : `Reimbursement from ${item.full_name} is not eligible for payment`}
                      checked={selectedKeys.has(selectionKey(item))}
                      className="payment-select-checkbox"
                      disabled={!eligible}
                      onChange={(event) => toggleRow(item, event.currentTarget.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td>
                    <Link
                      aria-label={`Review submission from ${item.full_name}`}
                      className="submission-link"
                      href={`/reimbursements/admin/${item.id}`}
                    >
                      {item.full_name}
                    </Link>
                    <div className="receipt-meta">{new Date(item.submitted_at).toLocaleDateString()}</div>
                  </td>
                  <td>{item.merchant || formatStatus(item.category)}</td>
                  <td className="amount">{formatMoney(item.amount)}</td>
                  <td className="amount">{item.receipt_total === null ? "—" : formatMoney(item.receipt_total)}</td>
                  <td>
                    <form action={updateStatus} className="inline-status-form">
                      <input name="id" type="hidden" value={item.id} />
                      <InlineStatusSelect status={item.status} />
                    </form>
                  </td>
                  <td>
                    <form action={updateReimbursed} className="inline-status-form">
                      <input name="id" type="hidden" value={item.id} />
                      <ReimbursedCheckbox key={`${item.id}:${item.reimbursed}`} reimbursed={item.reimbursed} />
                    </form>
                  </td>
                  <td><span className="submission-row-action">Review submission <span aria-hidden="true">→</span></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRows.length > 0 && (
        <div className="payment-selection-bar">
          <div aria-live="polite" role="status">
            <strong>{formatMoney(selectedTotalCents / 100)}</strong>
            <span>
              {selectedRows.length} {selectedRows.length === 1 ? "reimbursement" : "reimbursements"}
              {" · "}
              {paymentGroups.length} {paymentGroups.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div className="payment-selection-actions">
            <button className="button button-secondary button-compact" onClick={() => setSelectedKeys(new Set())} type="button">Clear</button>
            <button className="button button-primary button-compact" onClick={openReviewDialog} type="button">Review payments</button>
          </div>
        </div>
      )}

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
            <p className="eyebrow">Payment review</p>
            <h2 id="payment-review-heading">Confirm reimbursements</h2>
          </div>
          <button aria-label="Close payment review" className="payment-review-close" disabled={submitting} onClick={closeReviewDialog} type="button">×</button>
        </div>

        <div className="payment-group-list">
          {paymentGroups.map((group) => (
            <section className="payment-group" key={group.userId}>
              <div className="payment-group-summary">
                <div>
                  <h3>{group.fullName}</h3>
                  <span>{group.count} {group.count === 1 ? "reimbursement" : "reimbursements"}</span>
                </div>
                <strong>{formatMoney(group.cents / 100)}</strong>
              </div>
              <div className="payment-group-methods">
                <span>Payment instructions</span>
                {group.paymentMethods.length
                  ? group.paymentMethods.map((method) => <strong key={method}>{method}</strong>)
                  : <strong>Not provided</strong>}
              </div>
              {group.paymentMethods.length > 1 && (
                <p className="payment-method-warning">Multiple payment instructions were submitted. Verify the destination before sending payment.</p>
              )}
            </section>
          ))}
        </div>

        <div className="payment-review-total">
          <span>Grand total</span>
          <strong>{formatMoney(selectedTotalCents / 100)}</strong>
        </div>
        <p className="payment-review-note">This records the selected items as reimbursed. It does not send money through Zelle, Venmo, or another provider.</p>
        {dialogError && <p className="payment-dialog-error" role="alert">{dialogError}</p>}
        <div className="payment-review-actions">
          <button className="button button-secondary" disabled={submitting} onClick={closeReviewDialog} type="button">Cancel</button>
          <button className="button button-primary" disabled={submitting || !selectedRows.length} onClick={confirmPayments} type="button">
            {submitting ? "Marking reimbursed…" : "Mark selected as reimbursed"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
