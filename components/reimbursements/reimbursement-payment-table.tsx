"use client";
import { Button } from "@/components/brand/button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  markReimbursementsPaid,
  setReimbursementPaid,
} from "@/app/(admin)/finance/accounts/payable/actions";
import { setReimbursementStatus } from "@/app/(admin)/finance/review/actions";
import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import {
  InlineStatusSelect,
  type ReimbursementStatus,
} from "@/components/reimbursements/inline-status-select";
import { PrefetchRoutes } from "@/components/navigation/prefetch-routes";
import { ReimbursedCheckbox } from "@/components/reimbursements/reimbursed-checkbox";

export type PaymentTableRow = {
  user_id: string | null;
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

function selectionKey(row: PaymentTableRow) {
  return row.id;
}

export function ReimbursementPaymentTable({ rows }: { rows: PaymentTableRow[] }) {
  const router = useRouter();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [rowOverrides, setRowOverrides] = useState<Map<string, Partial<PaymentTableRow>>>(() => new Map());
  const [pendingFields, setPendingFields] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!rows.some((row) => row.status === "pending")) return;
    const interval = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [router, rows]);

  const optimisticRows = useMemo(() => rows.map((serverRow) => {
    const override = rowOverrides.get(serverRow.id);
    if (!override) return serverRow;

    const statusPending = pendingFields.has(`${serverRow.id}:status`);
    const reimbursedPending = pendingFields.has(`${serverRow.id}:reimbursed`);
    const serverIsCurrent = override.updated_at !== undefined
      && Date.parse(serverRow.updated_at) >= Date.parse(override.updated_at);

    return {
      ...serverRow,
      ...(!serverIsCurrent ? override : {}),
      status: (statusPending || !serverIsCurrent) && override.status !== undefined
        ? override.status
        : serverRow.status,
      reimbursed: (reimbursedPending || !serverIsCurrent) && override.reimbursed !== undefined
        ? override.reimbursed
        : serverRow.reimbursed,
    };
  }), [pendingFields, rowOverrides, rows]);

  function patchRow(id: string, patch: Partial<PaymentTableRow>) {
    setRowOverrides((current) => {
      const next = new Map(current);
      next.set(id, { ...next.get(id), ...patch });
      return next;
    });
  }

  function setFieldPending(key: string, pending: boolean) {
    setPendingFields((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function changeStatus(row: PaymentTableRow, status: ReimbursementStatus) {
    const key = `${row.id}:status`;
    const previousStatus = row.status;
    setMutationError("");
    patchRow(row.id, { status });
    setFieldPending(key, true);

    try {
      const result = await setReimbursementStatus(row.id, status);
      if (!result.ok) {
        patchRow(row.id, { status: previousStatus });
        setMutationError(result.message);
        return;
      }

      patchRow(row.id, result.row);
      router.refresh();
    } catch (error) {
      patchRow(row.id, { status: previousStatus });
      setMutationError(error instanceof Error ? error.message : "Unable to change the status.");
    } finally {
      setFieldPending(key, false);
    }
  }

  async function changeReimbursed(row: PaymentTableRow, reimbursed: boolean) {
    const key = `${row.id}:reimbursed`;
    const previousReimbursed = row.reimbursed;
    setMutationError("");
    patchRow(row.id, { reimbursed });
    setFieldPending(key, true);

    try {
      const result = await setReimbursementPaid(row.id, reimbursed);
      if (!result.ok) {
        patchRow(row.id, { reimbursed: previousReimbursed });
        setMutationError(result.message);
        return;
      }

      patchRow(row.id, result.row);
      router.refresh();
    } catch (error) {
      patchRow(row.id, { reimbursed: previousReimbursed });
      setMutationError(error instanceof Error ? error.message : "Unable to change the payment state.");
    } finally {
      setFieldPending(key, false);
    }
  }

  const eligibleRows = useMemo(
    () => optimisticRows.filter((row) => row.status === "approved" && !row.reimbursed),
    [optimisticRows],
  );
  const eligibleKeySet = useMemo(
    () => new Set(eligibleRows.map(selectionKey)),
    [eligibleRows],
  );
  const selectedRows = useMemo(
    () => optimisticRows.filter((row) => eligibleKeySet.has(selectionKey(row)) && selectedKeys.has(selectionKey(row))),
    [eligibleKeySet, optimisticRows, selectedKeys],
  );
  const selectedTotalCents = useMemo(
    () => selectedRows.reduce((total, row) => total + amountInCents(row.amount), 0),
    [selectedRows],
  );
  const paymentGroups = useMemo(() => {
    const groups = new Map<string, PaymentGroup & { methodSet: Set<string> }>();

    for (const row of selectedRows) {
      const paymentMethod = row.payment_method.trim();
      // Never combine different accounts (or unlinked historical submissions) by name.
      const nameKey = row.user_id ?? row.id;
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
    const paymentRows = selectedRows;
    const paymentIds = paymentRows.map((row) => row.id);
    setSubmitting(true);
    setDialogError("");
    setMutationError("");
    dialogRef.current?.close();
    setSelectedKeys(new Set());
    setFeedback(`Marking ${paymentRows.length} ${paymentRows.length === 1 ? "reimbursement" : "reimbursements"} as reimbursed…`);
    setRowOverrides((current) => {
      const next = new Map(current);
      for (const row of paymentRows) {
        next.set(row.id, { ...next.get(row.id), reimbursed: true });
      }
      return next;
    });
    for (const id of paymentIds) setFieldPending(`${id}:reimbursed`, true);

    try {
      const result = await markReimbursementsPaid(paymentIds);
      if (!result.ok) {
        setRowOverrides((current) => {
          const next = new Map(current);
          for (const row of paymentRows) {
            next.set(row.id, { ...next.get(row.id), reimbursed: row.reimbursed });
          }
          return next;
        });
        setFeedback("");
        setMutationError(result.message);
        return;
      }

      const updatedById = new Map(result.updatedRows.map((row) => [row.id, row]));
      setRowOverrides((current) => {
        const next = new Map(current);
        for (const row of paymentRows) {
          next.set(row.id, {
            ...next.get(row.id),
            ...(updatedById.get(row.id) ?? { reimbursed: row.reimbursed }),
          });
        }
        return next;
      });
      setFeedback(result.skippedIds.length
        ? `${result.updatedRows.length} marked reimbursed; ${result.skippedIds.length} skipped because they were no longer eligible.`
        : `${result.updatedRows.length} ${result.updatedRows.length === 1 ? "reimbursement" : "reimbursements"} marked reimbursed.`);
      router.refresh();
    } catch (error) {
      setRowOverrides((current) => {
        const next = new Map(current);
        for (const row of paymentRows) {
          next.set(row.id, { ...next.get(row.id), reimbursed: row.reimbursed });
        }
        return next;
      });
      setFeedback("");
      setMutationError(error instanceof Error ? error.message : "Unable to mark the selected reimbursements as paid.");
    } finally {
      for (const id of paymentIds) setFieldPending(`${id}:reimbursed`, false);
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <PrefetchRoutes hrefs={rows.map((row) => `/finance/accounts/payable/${row.id}`)} />
      <div className="card-header justify-between gap-4 flex-wrap">
        <span className="card-title">All reimbursements</span>
        <div
          aria-hidden={selectedRows.length === 0}
          className={
            "flex items-center gap-3 flex-wrap transition-opacity duration-150 " +
            (selectedRows.length > 0 ? "opacity-100" : "opacity-0 invisible pointer-events-none")
          }
        >
          <span aria-live="polite" className="text-[12px] text-muted" role="status">
            <strong className="tabular-nums text-ink">{formatMoney(selectedTotalCents / 100)}</strong>
            {" · "}
            {selectedRows.length} {selectedRows.length === 1 ? "reimbursement" : "reimbursements"}
            {" · "}
            {paymentGroups.length} {paymentGroups.length === 1 ? "member" : "members"}
          </span>
          <Button variant="secondary" compact disabled={selectedRows.length === 0} onClick={() => setSelectedKeys(new Set())} tabIndex={selectedRows.length === 0 ? -1 : undefined} type="button">Clear</Button>
          <Button variant="primary" compact disabled={selectedRows.length === 0} onClick={openReviewDialog} tabIndex={selectedRows.length === 0 ? -1 : undefined} type="button">Confirm selected payouts</Button>
        </div>
      </div>
      <div className="table-scroll border-t border-rule">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span>Pay</span>
                  <input
                    aria-label="Select all approved unpaid reimbursements"
                    checked={allEligibleSelected}
                    className="checkbox-brand"
                    disabled={!eligibleRows.length}
                    onChange={toggleAll}
                    ref={selectAllRef}
                    type="checkbox"
                  />
                </label>
              </th>
              <th>Member</th><th>Expense</th><th>Requested</th><th>Receipt total</th><th>Status</th><th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {optimisticRows.map((item) => {
              const eligible = item.status === "approved" && !item.reimbursed;
              const detailHref = `/finance/accounts/payable/${item.id}`;
              return (
                <tr className="submission-row" key={item.id}>
                  <td>
                    <label className="inline-action checkbox-cell">
                    <input
                      aria-label={eligible
                        ? `Select reimbursement from ${item.full_name} for ${formatMoney(item.amount)}`
                        : `Reimbursement from ${item.full_name} is not eligible for payment`}
                      checked={selectedKeys.has(selectionKey(item))}
                      className="checkbox-brand"
                      disabled={!eligible}
                      onChange={(event) => toggleRow(item, event.currentTarget.checked)}
                      title={eligible ? undefined : "Only approved, unpaid reimbursements can be selected"}
                      type="checkbox"
                    />
                    </label>
                  </td>
                  <td>
                    <Link
                      aria-label={`Review submission from ${item.full_name}`}
                      className="submission-link"
                      href={detailHref}
                      onMouseEnter={() => router.prefetch(detailHref)}
                    >
                      {item.full_name}
                    </Link>
                    <div className="row-meta">{new Date(item.submitted_at).toLocaleDateString()}</div>
                  </td>
                  <td>{item.merchant || formatCategory(item.category)}</td>
                  <td className="amount">{formatMoney(item.amount)}</td>
                  <td className="amount">{item.receipt_total === null ? "—" : formatMoney(item.receipt_total)}</td>
                  <td>
                    <div className="inline-action">
                      <InlineStatusSelect
                        disabled={item.reimbursed || item.status === "pending" || pendingFields.has(`${item.id}:status`)}
                        onChange={(status) => void changeStatus(item, status)}
                        status={item.status}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-action">
                      <ReimbursedCheckbox
                        disabled={pendingFields.has(`${item.id}:reimbursed`)}
                        onChange={(reimbursed) => void changeReimbursed(item, reimbursed)}
                        reimbursed={item.reimbursed}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {feedback && <p className="payment-feedback" role="status">{feedback}</p>}
      {mutationError && <p className="payment-dialog-error pb-3" role="alert">{mutationError}</p>}

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
            <p className="page-eyebrow m-0">Record payouts</p>
            <h2 id="payment-review-heading">Confirm selected payouts</h2>
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
          <strong>{formatMoney(selectedTotalCents / 100)}</strong>
        </div>
        <p className="payment-review-note">Send these payments separately, then confirm here. This records the payouts; it does not send money through Zelle.</p>
        {dialogError && <p className="payment-dialog-error" role="alert">{dialogError}</p>}
        <div className="payment-review-actions">
          <Button variant="secondary" disabled={submitting} onClick={closeReviewDialog} type="button">Cancel</Button>
          <Button variant="primary" disabled={submitting || !selectedRows.length} onClick={confirmPayments} type="button">
            {submitting ? "Recording payouts…" : "Record selected as paid"}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
