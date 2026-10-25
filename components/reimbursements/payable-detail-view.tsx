"use client";

import Link from "next/link";

import { EmailRecord } from "@/components/email/email-record";
import { RefreshWhile } from "@/components/navigation/refresh-while";
import { EditableCategory } from "@/components/reimbursements/editable-category";
import { EditableDescription } from "@/components/reimbursements/editable-description";
import { ReceiptImage } from "@/components/reimbursements/receipt-image";
import { PaidNotice, ReviewDecisionButtons, ReviewStatusBadge, ReviewStatusProvider } from "@/components/reimbursements/review-decision-buttons";
import { formatReimbursementDate, type ReimbursementCategory } from "@/lib/reimbursements/format";
import type { PayableDetailData } from "@/lib/reimbursements/payable-detail-data";

export function PayableDetailView({ detail, fullReceiptUrl = null }: { detail: PayableDetailData; fullReceiptUrl?: string | null }) {
  const processingComplete = detail.status !== "pending";
  const fullSrc = fullReceiptUrl ?? `/api/reimbursements/receipts/${detail.id}/original`;

  return (
    <ReviewStatusProvider amount={detail.amountValue} initialNote={detail.decisionNote} reimbursed={detail.reimbursed} reimbursementId={detail.id} requestedAmount={detail.requestedAmountValue} status={detail.status}>
      <RefreshWhile active={!processingComplete} />
      <Link className="back-link mb-4 inline-flex" href="/finance/accounts/payable">← All reimbursements</Link>
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <p className="page-eyebrow">Submission review</p>
          <h1 className="page-title">{detail.name}</h1>
          <p className="page-lede">Submitted {formatReimbursementDate(detail.submittedAt, true)}</p>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-details">
          <section className="card">
            <div className="card-header justify-between">
              <span className="card-title">Submission details</span>
              <ReviewStatusBadge />
            </div>
            <dl className="detail-list border-t border-rule">
              <div><dt>Requested amount</dt><dd className="amount">{detail.requestedAmount}</dd></div>
              {detail.amountValue !== detail.requestedAmountValue && <div><dt>Approved amount</dt><dd className="amount">{detail.amount}</dd></div>}
              <div><dt>Tabscanner total</dt><dd className="amount">{detail.tabscannerTotal}</dd></div>
              <div><dt>Category</dt><dd><EditableCategory category={detail.category as ReimbursementCategory} id={detail.id} /></dd></div>
              <div><dt>Receipt date</dt><dd>{formatReimbursementDate(detail.receiptDate)}</dd></div>
              <div className="detail-wide"><dt>Description</dt><dd><EditableDescription id={detail.id} description={detail.description} /></dd></div>
              <div className="detail-wide"><dt>Zelle phone number or email</dt><dd>{detail.paymentMethod}</dd></div>
            </dl>
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">Review decision</span></div>
            <div className="review-actions border-t border-rule">
              <PaidNotice />
              <div className="status-actions">
                <ReviewDecisionButtons disabled={!processingComplete} />
              </div>
              {!processingComplete && <p className="helper-text mt-3">Approval is available when automatic processing finishes.</p>}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">Emails to the member</span></div>
            <div className="border-t border-rule px-6">
              {detail.emails.length
                ? detail.emails.map((message) => <EmailRecord key={message.id} message={message} />)
                : <p className="py-6 text-sm text-muted">No emails sent yet.</p>}
            </div>
          </section>
        </div>

        <aside className="receipt-sidebar">
          <section className="card">
            <div className="card-header"><span className="card-title">Submitted receipt</span></div>
            <div className="receipt-image-wrap border-t border-rule">
              <ReceiptImage
                alt={`Receipt submitted by ${detail.name}`}
                comparisonMessage={detail.comparisonMessage}
                paymentMethod={detail.paymentMethod}
                processingComplete={processingComplete && !detail.reimbursed}
                reimbursementId={detail.id}
                reimbursementStatus={detail.status}
                src={detail.receiptUrl ?? fullSrc}
                fullSrc={fullSrc}
                submittedTotal={detail.requestedAmount}
                tabscannerTotal={detail.tabscannerTotal}
                totalsMatch={detail.totalsMatch}
              />
            </div>
          </section>

          <section aria-labelledby="amount-comparison-heading" className="card">
            <div className="totals-card-heading">
              <span className="card-title" id="amount-comparison-heading">Total comparison</span>
              <span className={`badge ${detail.totalsMatch ? "badge-approved" : "badge-pending"}`}>
                {detail.totalsMatch ? "Match" : "Review"}
              </span>
            </div>
            <div className="totals-card-values">
              <div><span>Submitted total</span><strong>{detail.requestedAmount}</strong></div>
              <span aria-hidden="true" className="verification-symbol">{detail.totalsMatch ? "=" : "≠"}</span>
              <div><span>Tabscanner total</span><strong>{detail.tabscannerTotal}</strong></div>
            </div>
            <p className={`totals-card-note ${detail.totalsMatch ? "verification-match" : "verification-review"}`}>
              {detail.comparisonMessage}
            </p>
          </section>
        </aside>
      </div>
    </ReviewStatusProvider>
  );
}
