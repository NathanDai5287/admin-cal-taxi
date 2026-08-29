import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateStatus } from "@/app/reimbursements/admin/actions";
import { AppHeader } from "@/components/reimbursements/app-header";
import { ReceiptImage } from "@/components/reimbursements/receipt-image";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { formatMoney, formatStatus } from "@/lib/reimbursements/format";

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

export default async function AdminSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, profile, email } = await requireAdmin();
  const { data: reimbursement } = await supabase
    .from("reimbursements")
    .select("id, full_name, category, amount, description, payment_method, receipt_path, status, merchant, receipt_date, receipt_total, failure_reason, submitted_at")
    .eq("id", id)
    .single();

  if (!reimbursement) notFound();

  const { data: receipt } = await supabase.storage
    .from("receipts")
    .createSignedUrl(reimbursement.receipt_path, 600);
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
    <main className="app-shell">
      <AppHeader email={email} isAdmin name={profile.full_name} />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Submission review</p>
            <h1>{reimbursement.full_name}</h1>
            <p>Submitted {formatDate(reimbursement.submitted_at, true)}</p>
          </div>
          <Link className="back-link" href="/reimbursements/admin">← All submissions</Link>
        </div>

        <div className="review-grid">
          <div className="review-details">
            <section className="panel">
              <div className="panel-header review-panel-heading">
                <h2>Submission details</h2>
                <span className={`badge badge-${reimbursement.status}`}>{formatStatus(reimbursement.status)}</span>
              </div>
              <dl className="detail-list">
                <div><dt>Requested amount</dt><dd className="amount">{formatMoney(reimbursement.amount)}</dd></div>
                <div><dt>Category</dt><dd>{formatStatus(reimbursement.category)}</dd></div>
                <div><dt>Merchant</dt><dd>{reimbursement.merchant || "Not detected"}</dd></div>
                <div><dt>Receipt date</dt><dd>{formatDate(reimbursement.receipt_date)}</dd></div>
                <div className="detail-wide"><dt>Description</dt><dd>{reimbursement.description}</dd></div>
                <div className="detail-wide"><dt>Preferred payment method</dt><dd>{reimbursement.payment_method}</dd></div>
              </dl>
            </section>

            <section className="panel">
              <div className="panel-header"><h2>Admin review</h2></div>
              <div className="review-actions">
                <p>Review the details and receipt image before making a decision.</p>
                <div className="status-actions">
                  <form action={updateStatus}>
                    <input name="id" type="hidden" value={reimbursement.id} />
                    <input name="status" type="hidden" value="approved" />
                    <button className="button button-primary" disabled={reimbursement.status === "approved" || !processingComplete} type="submit">
                      {reimbursement.status === "approved" ? "Approved" : "Approve submission"}
                    </button>
                  </form>
                  <form action={updateStatus}>
                    <input name="id" type="hidden" value={reimbursement.id} />
                    <input name="status" type="hidden" value="denied" />
                    <button className="button button-danger" disabled={reimbursement.status === "denied" || !processingComplete} type="submit">
                      {reimbursement.status === "denied" ? "Denied" : "Deny submission"}
                    </button>
                  </form>
                </div>
                {!processingComplete && <p className="helper-text">Approval is available when automatic processing finishes.</p>}
              </div>
            </section>
          </div>

          <aside className="receipt-sidebar">
            <section className="panel receipt-panel">
              <div className="panel-header"><h2>Submitted receipt</h2></div>
              <div className="receipt-image-wrap">
                {receipt?.signedUrl
                  ? (
                    <ReceiptImage
                      alt={`Receipt submitted by ${reimbursement.full_name}`}
                      comparisonMessage={comparisonMessage}
                      paymentMethod={reimbursement.payment_method}
                      processingComplete={processingComplete}
                      reimbursementId={reimbursement.id}
                      reimbursementStatus={reimbursement.status}
                      src={receipt.signedUrl}
                      submittedTotal={submittedTotal}
                      tabscannerTotal={tabscannerTotal}
                      totalsMatch={totalsMatch}
                    />
                  )
                  : <div className="empty-state">Receipt image is unavailable.</div>}
              </div>
            </section>

            <section aria-labelledby="amount-comparison-heading" className="panel totals-card">
              <div className="totals-card-heading">
                <h2 id="amount-comparison-heading">Total comparison</h2>
                <span className={`badge ${totalsMatch ? "badge-verified" : "badge-pending"}`}>
                  {totalsMatch ? "Match" : "Review"}
                </span>
              </div>
              <div className="totals-card-values">
                <div><span>Submitted total</span><strong>{submittedTotal}</strong></div>
                <span aria-hidden="true" className="verification-symbol">{totalsMatch ? "=" : "≠"}</span>
                <div><span>Tabscanner total</span><strong>{tabscannerTotal}</strong></div>
              </div>
              <p className={totalsMatch ? "verification-match" : "verification-review"}>
                {comparisonMessage}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
