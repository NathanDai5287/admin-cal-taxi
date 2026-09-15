import { requireAdmin } from "@/lib/reimbursements/auth";
import type { Metadata } from "next";

import { ReimbursementPaymentTable } from "@/components/reimbursements/reimbursement-payment-table";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

export default async function ReimbursementsPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await loadAllPages((from, to) => supabase
    .from("reimbursements")
    .select("id, user_id, full_name, amount, category, status, merchant, receipt_total, payment_method, reimbursed, submitted_at, updated_at")
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to));

  if (error) {
    throw new Error(`Unable to load reimbursements: ${error.message}`);
  }

  const rows = data ?? [];

  return (
    <>
      <div className="mb-6">
        <p className="page-eyebrow">Chapter finances</p>
        <h1 className="page-title">Review reimbursements</h1>
        <p className="page-lede">
          Inspect receipts and approve or deny requests. Approved requests appear in Accounts → Payable.
        </p>
      </div>

      {rows.length ? (
        <ReimbursementPaymentTable mode="review" rows={rows} />
      ) : (
        <section className="card">
          <div className="card-header"><span className="card-title">All submissions</span></div>
          <div className="empty-state">No reimbursements to review.</div>
        </section>
      )}
    </>
  );
}
