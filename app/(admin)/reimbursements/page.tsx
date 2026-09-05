import type { Metadata } from "next";

import { ReimbursementPaymentTable } from "@/components/reimbursements/reimbursement-payment-table";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

export default async function ReimbursementsPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursements")
    .select("id, full_name, amount, category, status, merchant, receipt_total, payment_method, reimbursed, submitted_at, updated_at")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load reimbursements: ${error.message}`);
  }

  const rows = data ?? [];

  return (
    <>
      <div className="mb-6">
        <p className="page-eyebrow">Chapter reimbursements</p>
        <h1 className="page-title">Review reimbursements</h1>
        <p className="page-lede">
          Move submitted expenses through review, then mark approved items as reimbursed.
        </p>
      </div>

      {rows.length ? (
        <ReimbursementPaymentTable rows={rows} />
      ) : (
        <section className="card">
          <div className="card-header"><span className="card-title">All submissions</span></div>
          <div className="empty-state">No reimbursements to review.</div>
        </section>
      )}
    </>
  );
}
