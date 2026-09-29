import { requireAdmin } from "@/lib/reimbursements/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditableCategory } from "@/components/reimbursements/editable-category";
import { EditableMerchant } from "@/components/reimbursements/editable-merchant";
import { ReceiptImage } from "@/components/reimbursements/receipt-image";
import { PayableReceiptPlaceholder } from "@/components/reimbursements/payable-receipt-placeholder";
import type { ReimbursementStatus } from "@/components/reimbursements/inline-status-select";
import { ReviewDecisionButtons, ReviewStatusBadge, ReviewStatusProvider } from "@/components/reimbursements/review-decision-buttons";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { getReceiptPreviewUrls } from "@/lib/reimbursements/receipt-preview-urls";
import { RefreshWhile } from "@/components/navigation/refresh-while";

export const metadata: Metadata = { title: "Review submission" };
export const dynamic = "force-dynamic";

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Not detected";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: includeTime ? undefined : "UTC",
  }).format(new Date(value));
}

async function SignedReceipt({
  id,
  receiptPath,
  fullName,
  comparisonMessage,
  paymentMethod,
  processingComplete,
  reimbursementStatus,
  submittedTotal,
  tabscannerTotal,
  totalsMatch,
}: {
  id: string;
  receiptPath: string;
  fullName: string;
  comparisonMessage: string;
  paymentMethod: string;
  processingComplete: boolean;
  reimbursementStatus: ReimbursementStatus;
  submittedTotal: string;
  tabscannerTotal: string;
  totalsMatch: boolean;
}) {
  const previewUrls = await getReceiptPreviewUrls([receiptPath]);
  const fullSrc = `/api/reimbursements/receipts/${id}/original`;

  return (
    <div className="receipt-image-wrap border-t border-rule">
      <ReceiptImage
        alt={`Receipt submitted by ${fullName}`}
        comparisonMessage={comparisonMessage}
        paymentMethod={paymentMethod}
        processingComplete={processingComplete}
        reimbursementId={id}
        reimbursementStatus={reimbursementStatus}
        src={previewUrls.get(receiptPath) ?? fullSrc}
        fullSrc={fullSrc}
        submittedTotal={submittedTotal}
        tabscannerTotal={tabscannerTotal}
        totalsMatch={totalsMatch}
      />
    </div>
  );
}

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [, { id }] = await Promise.all([requireAdmin(), params]);
  const supabase = createAdminClient();
  const { data: reimbursement } = await supabase
    .from("reimbursements")
    .select("id, full_name, category, amount, description, payment_method, receipt_path, status, reimbursed, merchant, receipt_date, receipt_total, failure_reason, denial_reason, submitted_at")
    .eq("id", id)
    .single();

  if (!reimbursement) notFound();

  const requestedCents = Math.round(Number(reimbursement.amount) * 100);
  const receiptCents = reimbursement.receipt_total === null
    ? null
    : Math.round(Number(reimbursement.receipt_total) * 100);
  const totalsMatch = receiptCents !== null && requestedCents === receiptCents;
  const processingComplete = reimbursement.status !== "pending";
  const submittedTotal = formatMoney(reimbursement.amount);
  const tabscannerTotal = reimbursement.receipt_total === null
    ? "—"
    : formatMoney(reimbursement.receipt_total);
  const comparisonMessage = totalsMatch
    ? "The submitted and scanned totals match."
    : reimbursement.status === "pending"
      ? "Tabscanner is still processing this receipt."
      : reimbursement.status === "processing_failed"
        ? `Automatic verification failed${reimbursement.failure_reason ? `: ${reimbursement.failure_reason}` : "."}`
        : "The totals differ and need manual review.";

  return (
    <ReviewStatusProvider initialDenialReason={reimbursement.denial_reason ?? ""} reimbursementId={reimbursement.id} status={reimbursement.status}>
      <RefreshWhile active={reimbursement.status === "pending"} />
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <p className="page-eyebrow">Submission review</p>
          <h1 className="page-title">{reimbursement.full_name}</h1>
          <p className="page-lede">Submitted {formatDate(reimbursement.submitted_at, true)}</p>
        </div>
        <Link className="back-link" href="/finance/accounts/payable">← All reimbursements</Link>
      </div>

      <div className="review-grid">
        <div className="review-details">
          <section className="card">
            <div className="card-header justify-between">
              <span className="card-title">Submission details</span>
              <ReviewStatusBadge />
            </div>
            <dl className="detail-list border-t border-rule">
              <div><dt>Requested amount</dt><dd className="amount">{formatMoney(reimbursement.amount)}</dd></div>
              <div><dt>Tabscanner total</dt><dd className="amount">{tabscannerTotal}</dd></div>
              <div><dt>Category</dt><dd><EditableCategory category={reimbursement.category} id={reimbursement.id} /></dd></div>
              <div><dt>Receipt date</dt><dd>{formatDate(reimbursement.receipt_date)}</dd></div>
              <div className="detail-wide"><dt>Expense</dt><dd><EditableMerchant id={reimbursement.id} merchant={reimbursement.merchant} /></dd></div>
              <div className="detail-wide"><dt>Description</dt><dd>{reimbursement.description}</dd></div>
              <div className="detail-wide"><dt>Zelle phone number or email</dt><dd>{reimbursement.payment_method}</dd></div>
            </dl>
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">Review decision</span></div>
            <div className="review-actions border-t border-rule">
              <p>{reimbursement.reimbursed ? "This reimbursement has been paid. Correct the payment in Accounts before changing the decision." : "Review the details and receipt image before making a decision."}</p>
              <div className="status-actions">
                <ReviewDecisionButtons disabled={reimbursement.reimbursed || !processingComplete} />
              </div>
              {!processingComplete && <p className="helper-text mt-3">Approval is available when automatic processing finishes.</p>}
            </div>
          </section>
        </div>

        <aside className="receipt-sidebar">
          <section className="card">
            <div className="card-header"><span className="card-title">Submitted receipt</span></div>
            <Suspense fallback={<PayableReceiptPlaceholder id={reimbursement.id} />}>
              <SignedReceipt
                id={reimbursement.id}
                receiptPath={reimbursement.receipt_path}
                fullName={reimbursement.full_name}
                comparisonMessage={comparisonMessage}
                paymentMethod={reimbursement.payment_method}
                processingComplete={processingComplete && !reimbursement.reimbursed}
                reimbursementStatus={reimbursement.status}
                submittedTotal={submittedTotal}
                tabscannerTotal={tabscannerTotal}
                totalsMatch={totalsMatch}
              />
            </Suspense>
          </section>

          <section aria-labelledby="amount-comparison-heading" className="card">
            <div className="totals-card-heading">
              <span className="card-title" id="amount-comparison-heading">Total comparison</span>
              <span className={`badge ${totalsMatch ? "badge-approved" : "badge-pending"}`}>
                {totalsMatch ? "Match" : "Review"}
              </span>
            </div>
            <div className="totals-card-values">
              <div><span>Submitted total</span><strong>{submittedTotal}</strong></div>
              <span aria-hidden="true" className="verification-symbol">{totalsMatch ? "=" : "≠"}</span>
              <div><span>Tabscanner total</span><strong>{tabscannerTotal}</strong></div>
            </div>
            <p className={`totals-card-note ${totalsMatch ? "verification-match" : "verification-review"}`}>
              {comparisonMessage}
            </p>
          </section>
        </aside>
      </div>
    </ReviewStatusProvider>
  );
}
