import Link from "next/link";
import { ReimbursementPaymentTable } from "@/components/reimbursements/reimbursement-payment-table";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { formatMoney } from "@/lib/reimbursements/format";
import { requireAdmin } from "@/lib/reimbursements/auth";

export const metadata = { title: "Accounts payable" };
export const dynamic = "force-dynamic";
export default async function PayablePage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  await requireAdmin();
  const paid = (await searchParams).paid === "true";
  const { data, error } = await createAdminClient().from("reimbursements")
    .select("id, user_id, full_name, amount, category, status, merchant, receipt_total, payment_method, reimbursed, submitted_at, updated_at")
    .eq("status", "approved").eq("reimbursed", paid).order("submitted_at");
  if (error) throw new Error(`Unable to load payables: ${error.message}`);
  const rows = data ?? [];
  return <div className="grid gap-6">
    <div><p className="page-eyebrow">Chapter finances</p><h1 className="page-title">Accounts payable</h1><p className="page-lede">Record payouts for approved reimbursements.</p></div>
    <div className="flex gap-4">
      <Link className="back-link" aria-current={!paid ? "page" : undefined} href="/finance/accounts/payable">Awaiting payment</Link>
      <Link className="back-link" aria-current={paid ? "page" : undefined} href="/finance/accounts/payable?paid=true">Paid history</Link>
    </div>
    <section className="stat-grid"><article className="stat stat-primary"><span>{paid ? "Paid" : "Awaiting payment"}</span><strong>{formatMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0))}</strong><small>{rows.length} reimbursements</small></article></section>
    {rows.length ? <ReimbursementPaymentTable mode="payment" rows={rows} /> : <div className="empty-state">{paid ? "No paid reimbursements." : "No approved reimbursements awaiting payment."}</div>}
  </div>;
}
