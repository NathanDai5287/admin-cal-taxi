import { ReimbursementPaymentTable } from "@/components/reimbursements/reimbursement-payment-table";
import { PreloadReceipts } from "@/components/reimbursements/preload-receipts";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { formatMoney } from "@/lib/reimbursements/format";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { getReceiptPreviewUrls } from "@/lib/reimbursements/receipt-preview-urls";

export const metadata = { title: "Accounts payable" };
export const dynamic = "force-dynamic";
export default async function PayablePage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await loadAllPages((from, to) => supabase.from("reimbursements")
    .select("id, user_id, full_name, amount, category, status, merchant, description, receipt_date, receipt_path, receipt_total, failure_reason, denial_reason, payment_method, reimbursed, submitted_at, updated_at")
    .order("submitted_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
  if (error) throw new Error(`Unable to load payables: ${error.message}`);
  const rows = data ?? [];
  const previewUrls = await getReceiptPreviewUrls(rows.map((row) => row.receipt_path));
  const paymentRows = rows.map(({ receipt_path, ...row }) => ({
    ...row,
    receipt_preview_url: previewUrls.get(receipt_path) ?? null,
  }));
  const readyToPay = rows.filter((row) => row.status === "approved" && !row.reimbursed);
  const total = readyToPay.reduce((sum, row) => sum + Number(row.amount), 0);
  return <div className="payable-page grid gap-6">
    <div>
      <p className="page-eyebrow">Chapter finances</p>
      <h1 className="page-title">Reimbursements to pay</h1>
      <p className="page-lede">Review requests, approve or deny them, and record approved payouts here.</p>
    </div>

    <section className="dues-summary" aria-label="Reimbursement summary">
      <div className="dues-summary-primary"><span>Ready to pay</span><strong>{formatMoney(total)}</strong><p>Approved and awaiting payout</p></div>
      <div><span>All requests</span><strong>{rows.length}</strong><p>{rows.length === 1 ? "Reimbursement" : "Reimbursements"} submitted</p></div>
      <div><span>Next step</span><strong className="text-[18px]!">{readyToPay.length ? "Select rows" : "Review requests"}</strong><p>{readyToPay.length ? "Choose approved requests, then confirm payments" : "Approve requests before recording payouts"}</p></div>
    </section>

    {rows.length ? <>
      <PreloadReceipts urls={paymentRows.slice(0, 6).flatMap((row) => row.receipt_preview_url ? [row.receipt_preview_url] : [])} />
      <ReimbursementPaymentTable rows={paymentRows} />
    </> : (
      <section className="card">
        <div className="empty-state">
          <strong className="block text-[15px] text-ink">No reimbursements yet</strong>
          <p className="mx-auto mt-2 max-w-[420px]">Submitted reimbursements will appear here.</p>
        </div>
      </section>
    )}
  </div>;
}
