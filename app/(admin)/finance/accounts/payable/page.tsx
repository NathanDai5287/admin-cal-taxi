import Link from "next/link";
import { ButtonLink } from "@/components/brand/button";
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
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  return <div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="page-eyebrow">Chapter finances</p><h1 className="page-title">Reimbursements to pay</h1><p className="page-lede">Pay requests after they are approved, then record the payout here.</p></div>
      <ButtonLink href="/finance/review" variant="secondary">Review submitted requests</ButtonLink>
    </div>

    <nav aria-label="Reimbursement payment status" className="inline-flex w-fit border border-rule bg-surface p-1">
      <Link className={`px-4 py-2 text-[12px] font-bold ${!paid ? "bg-action text-white" : "text-muted hover:text-ink"}`} aria-current={!paid ? "page" : undefined} href="/finance/accounts/payable">Needs payment</Link>
      <Link className={`px-4 py-2 text-[12px] font-bold ${paid ? "bg-action text-white" : "text-muted hover:text-ink"}`} aria-current={paid ? "page" : undefined} href="/finance/accounts/payable?paid=true">Paid history</Link>
    </nav>

    <section className="dues-summary" aria-label={paid ? "Paid reimbursement summary" : "Unpaid reimbursement summary"}>
      <div className="dues-summary-primary"><span>{paid ? "Total paid" : "Ready to pay"}</span><strong>{formatMoney(total)}</strong><p>{paid ? "Recorded payout history" : "Approved and awaiting payout"}</p></div>
      <div><span>Requests</span><strong>{rows.length}</strong><p>{rows.length === 1 ? "Reimbursement" : "Reimbursements"} in this view</p></div>
      <div><span>{paid ? "This view" : "Next step"}</span><strong className="text-[18px]!">{paid ? "History" : rows.length ? "Select rows" : "All clear"}</strong><p>{paid ? "Uncheck Reimbursed to correct a payout" : rows.length ? "Choose one or more, then review payments" : "No payouts need attention"}</p></div>
    </section>

    {rows.length ? <ReimbursementPaymentTable mode="payment" rows={rows} /> : (
      <section className="card">
        <div className="empty-state">
          <strong className="block text-[15px] text-ink">{paid ? "No paid reimbursements yet" : "No reimbursements are waiting for payment"}</strong>
          <p className="mx-auto mt-2 max-w-[420px]">{paid ? "Completed payouts will appear here." : "When a request is approved in Review, it will appear on this page automatically."}</p>
          {!paid && <div className="mt-5"><ButtonLink href="/finance/review" variant="secondary">Go to reimbursement review</ButtonLink></div>}
        </div>
      </section>
    )}
  </div>;
}
