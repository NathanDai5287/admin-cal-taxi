"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { PayableReceiptPlaceholder } from "@/components/reimbursements/payable-receipt-placeholder";
import {
  getPayableNavigationPreview,
  getServerPayableNavigationPreview,
  subscribeToPayableNavigationPreview,
} from "@/components/reimbursements/payable-navigation-preview";
import { formatCategory, formatReimbursementDate, formatStatus } from "@/lib/reimbursements/format";

export function PayableDetailLoading() {
  const { id } = useParams<{ id: string }>();
  const preview = useSyncExternalStore(
    subscribeToPayableNavigationPreview,
    getPayableNavigationPreview,
    getServerPayableNavigationPreview,
  );
  const selected = preview?.id === id ? preview : null;

  return (
    <div aria-label="Loading reimbursement details" aria-busy="true">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <p className="page-eyebrow">Submission review</p>
          <h1 className="page-title">{selected?.name ?? "Loading reimbursement…"}</h1>
          {selected && <p className="page-lede">Submitted {formatReimbursementDate(selected.submittedAt, true)}</p>}
        </div>
        <Link className="back-link" href="/finance/accounts/payable">← All reimbursements</Link>
      </div>
      <div className="review-grid">
        <div className="review-details">
          <section aria-label="Loading submission details" className="card">
            <div className="card-header justify-between">
              <span className="card-title">Submission details</span>
              {selected && <span className={`badge badge-${selected.status}`}>{formatStatus(selected.status)}</span>}
            </div>
            {selected ? (
              <dl className="detail-list border-t border-rule">
                <div><dt>Requested amount</dt><dd className="amount">{selected.amount}</dd></div>
                <div><dt>Tabscanner total</dt><dd className="amount">{selected.tabscannerTotal}</dd></div>
                <div><dt>Category</dt><dd>{formatCategory(selected.category)}</dd></div>
                <div><dt>Receipt date</dt><dd>{formatReimbursementDate(selected.receiptDate)}</dd></div>
                <div className="detail-wide"><dt>Expense</dt><dd>{selected.merchant || "Not detected"}</dd></div>
                <div className="detail-wide"><dt>Description</dt><dd>{selected.description}</dd></div>
                <div className="detail-wide"><dt>Zelle phone number or email</dt><dd>{selected.paymentMethod}</dd></div>
              </dl>
            ) : (
              <div aria-hidden="true" className="card-body grid gap-4">
                <span className="loading-block block h-[30px] w-[55%]" />
                <span className="loading-block block h-[22px] w-[75%]" />
                <span className="loading-block block h-[22px] w-[62%]" />
                <span className="loading-block block h-[22px] w-[85%]" />
              </div>
            )}
          </section>
          {selected && (
            <section className="card">
              <div className="card-header"><span className="card-title">Review decision</span></div>
              <div className="review-actions border-t border-rule">
                <p>{selected.reimbursed ? "This reimbursement has been paid. Correct the payment in Accounts before changing the decision." : "Review the details and receipt image before making a decision."}</p>
                <span aria-hidden="true" className="loading-block block h-9 w-44" />
              </div>
            </section>
          )}
        </div>
        <aside className="receipt-sidebar">
          <section className="card">
            <div className="card-header"><span className="card-title">Submitted receipt</span></div>
            <PayableReceiptPlaceholder id={id} />
          </section>
          {selected && (
            <section aria-labelledby="loading-amount-comparison-heading" className="card">
              <div className="totals-card-heading">
                <span className="card-title" id="loading-amount-comparison-heading">Total comparison</span>
                <span className={`badge ${selected.totalsMatch ? "badge-approved" : "badge-pending"}`}>
                  {selected.totalsMatch ? "Match" : "Review"}
                </span>
              </div>
              <div className="totals-card-values">
                <div><span>Submitted total</span><strong>{selected.amount}</strong></div>
                <span aria-hidden="true" className="verification-symbol">{selected.totalsMatch ? "=" : "≠"}</span>
                <div><span>Tabscanner total</span><strong>{selected.tabscannerTotal}</strong></div>
              </div>
              <p className={`totals-card-note ${selected.totalsMatch ? "verification-match" : "verification-review"}`}>
                {selected.comparisonMessage}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
