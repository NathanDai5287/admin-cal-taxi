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
import { ReimbursedCheckbox } from "@/components/reimbursements/reimbursed-checkbox";
import { setPayableNavigationPreview } from "@/components/reimbursements/payable-navigation-preview";
import { payableDetailData } from "@/lib/reimbursements/payable-detail-data";

export type PaymentTableRow = {
  user_id: string | null;
  amount: number;
  category: string;
  description: string;
  denial_reason: string | null;
  failure_reason: string | null;
  full_name: string;
  id: string;
  merchant: string | null;
  payment_method: string;
  receipt_date: string | null;
  receipt_preview_url: string | null;
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
  const denialDialogRef = useRef<HTMLDialogElement>(null);
  const [denialTarget, setDenialTarget] = useState<PaymentTableRow | null>(null);
  const [denialNote, setDenialNote] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [rowOverrides, setRowOverrides] = useState<Map<string, Partial<PaymentTableRow>>>(() => new Map());
  const [pendingFields, setPendingFields] = useState<Set<string>>(() => new Set());
  const [activePreview, setActivePreview] = useState<PaymentTableRow | null>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const warmedPreviewImages = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    const body = tableBodyRef.current;
    if (!body) return;
    const liveUrls = new Set(rows.flatMap((row) => row.receipt_preview_url ? [row.receipt_preview_url] : []));
    for (const url of warmedPreviewImages.current.keys()) {
      if (!liveUrls.has(url)) warmedPreviewImages.current.delete(url);
    }
    const warm = (url: string | null) => {
      if (!url || warmedPreviewImages.current.has(url)) return;
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      warmedPreviewImages.current.set(url, image);
      image.onerror = () => warmedPreviewImages.current.delete(url);
      image.src = url;
      void image.decode().catch(() => {});
    };

    // The rows most likely to be scanned are ready as soon as hydration finishes.
    rows.slice(0, 8).forEach((row) => warm(row.receipt_preview_url));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = Number((entry.target as HTMLElement).dataset.previewIndex);
        warm(rows[index]?.receipt_preview_url ?? null);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "300px 0px" });
    body.querySelectorAll("tr[data-preview-index]").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [rows]);

  function showPreview(row: PaymentTableRow, keyboard = false) {
    if (!keyboard && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    setActivePreview(row);
    rememberNavigationPreview(row);
  }

  function hidePreview() {
    if (!window.matchMedia("(min-width: 1320px)").matches) setActivePreview(null);
  }

  function rememberNavigationPreview(row: PaymentTableRow) {
    setPayableNavigationPreview(payableDetailData(row, row.receipt_preview_url));
  }

  useEffect(() => {
    if (!rows.some((row) => row.status === "pending")) return;
    const interval = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [router, rows]);

  useEffect(() => {
    // Signed previews last 20 minutes and the server reuses them for up to 15.
    // A four-minute check also covers a page opened just before cache expiry.
    let lastRefresh = Date.now();
    const refreshStalePreviews = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 4 * 60_000) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    const interval = window.setInterval(refreshStalePreviews, 60_000);
    document.addEventListener("visibilitychange", refreshStalePreviews);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshStalePreviews);
    };
  }, [router]);

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

  async function changeStatus(row: PaymentTableRow, status: ReimbursementStatus, denialReason?: string) {
    const key = `${row.id}:status`;
    const previousStatus = row.status;
    const previousDenialReason = row.denial_reason;
    const nextDenialReason = status === "denied" ? denialReason?.trim() || null : null;
    setMutationError("");
    patchRow(row.id, { status, denial_reason: nextDenialReason });
    setFieldPending(key, true);

    try {
      const result = await setReimbursementStatus(row.id, status, denialReason);
      if (!result.ok) {
        patchRow(row.id, { status: previousStatus, denial_reason: previousDenialReason });
        setMutationError(result.message);
        return;
      }

      patchRow(row.id, result.row);
      router.refresh();
    } catch (error) {
      patchRow(row.id, { status: previousStatus, denial_reason: previousDenialReason });
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

  function requestStatusChange(row: PaymentTableRow, status: ReimbursementStatus) {
    if (status === "denied") {
      setDenialNote("");
      setDenialTarget(row);
      denialDialogRef.current?.showModal();
      return;
    }
    void changeStatus(row, status);
  }

  function closeDenialDialog() {
    denialDialogRef.current?.close();
    setDenialTarget(null);
  }

  async function confirmDenial() {
    const row = denialTarget;
    if (!row) return;
    denialDialogRef.current?.close();
    setDenialTarget(null);
    await changeStatus(row, "denied", denialNote.trim());
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
    <div className="payable-workspace">
    <section className="card payable-table-card">
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
              <th>Member</th><th>Expense</th><th>Amount</th><th>Status</th><th>Paid</th>
            </tr>
          </thead>
          <tbody ref={tableBodyRef}>
            {optimisticRows.map((item, index) => {
              const eligible = item.status === "approved" && !item.reimbursed;
              const detailHref = `/finance/accounts/payable/${item.id}`;
              return (
                <tr
                  className="submission-row"
                  data-preview-index={index}
                  key={item.id}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) hidePreview();
                  }}
                  onFocusCapture={() => showPreview(item, true)}
                  onMouseEnter={() => showPreview(item)}
                  onMouseLeave={hidePreview}
                >
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
                      onClick={() => rememberNavigationPreview(item)}
                    >
                      {item.full_name}
                    </Link>
                    <div className="row-meta">{new Date(item.submitted_at).toLocaleDateString()}</div>
                  </td>
                  <td>{item.merchant || formatCategory(item.category)}</td>
                  <td className="amount">
                    <span className="amount-check">
                      {formatMoney(item.amount)}
                      <span
                        aria-label={item.receipt_total === null
                          ? "Tabscanner amount not available"
                          : Math.round(Number(item.amount) * 100) === Math.round(Number(item.receipt_total) * 100)
                            ? `Matches Tabscanner total ${formatMoney(item.receipt_total)}`
                            : `Differs from Tabscanner total ${formatMoney(item.receipt_total)}`}
                        className={`amount-check-dot ${item.receipt_total === null ? "is-unknown" : Math.round(Number(item.amount) * 100) === Math.round(Number(item.receipt_total) * 100) ? "is-match" : "is-different"}`}
                        role="img"
                        title={item.receipt_total === null ? "Tabscanner total unavailable" : `Tabscanner: ${formatMoney(item.receipt_total)}`}
                      />
                    </span>
                  </td>
                  <td>
                    <div className="inline-action">
                      <InlineStatusSelect
                        disabled={item.reimbursed || item.status === "pending" || pendingFields.has(`${item.id}:status`)}
                        onChange={(status) => requestStatusChange(item, status)}
                        status={item.status}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-action">
                      <ReimbursedCheckbox
                        disabled={item.status !== "approved" || pendingFields.has(`${item.id}:reimbursed`)}
                        onChange={(reimbursed) => void changeReimbursed(item, reimbursed)}
                        reimbursed={item.reimbursed}
                        title={item.status === "approved" ? undefined : "Only approved reimbursements can be marked paid"}
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

      <dialog
        aria-labelledby="denial-note-heading"
        className="payment-review-dialog"
        onCancel={closeDenialDialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDenialDialog();
        }}
        ref={denialDialogRef}
      >
        <div className="payment-review-heading">
          <div>
            <p className="page-eyebrow m-0">Review decision</p>
            <h2 id="denial-note-heading">Deny {denialTarget ? `${denialTarget.full_name}’s` : "submission"} request</h2>
          </div>
          <button aria-label="Close denial dialog" className="payment-review-close" onClick={closeDenialDialog} type="button">×</button>
        </div>
        <div className="grid gap-2 px-6 pt-4">
          <label className="field-label" htmlFor="payment-table-denial-note">Why is this being denied? (optional)</label>
          <textarea
            className="field-textarea"
            id="payment-table-denial-note"
            maxLength={500}
            onChange={(event) => setDenialNote(event.currentTarget.value)}
            placeholder="For example: the receipt is illegible, or the expense is not covered."
            rows={3}
            value={denialNote}
          />
          <p className="field-hint">The member sees this note with their denied request.</p>
        </div>
        <div className="payment-review-actions">
          <Button variant="secondary" onClick={closeDenialDialog} type="button">Cancel</Button>
          <Button variant="danger" onClick={confirmDenial} type="button">Deny submission</Button>
        </div>
      </dialog>
    </section>
    <aside
      aria-label="Receipt preview"
      className={`payable-receipt-rail${activePreview ? " is-active" : ""}`}
    >
      <div className="payable-receipt-rail-heading">
        <span>Receipt preview</span>
        {activePreview && <strong>{activePreview.full_name}</strong>}
      </div>
      {activePreview ? (
        activePreview.receipt_preview_url ? (
          // Signed Supabase URLs are temporary and should be fetched directly.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`Receipt submitted by ${activePreview.full_name}`}
            decoding="async"
            src={activePreview.receipt_preview_url}
          />
        ) : <div className="payable-receipt-unavailable">Receipt preview unavailable</div>
      ) : <div className="payable-receipt-empty">Hover or focus a row to see its receipt.</div>}
      {activePreview && (
        <div className="payable-receipt-rail-footer">
          <span>{activePreview.merchant || formatCategory(activePreview.category)}</span>
          <strong>{formatMoney(activePreview.amount)}</strong>
        </div>
      )}
    </aside>
    </div>
  );
}
