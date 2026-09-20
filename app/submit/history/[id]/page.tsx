import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { memberPaymentStatus, memberStatus, memberSubmissionDate } from "@/lib/reimbursements/member-status";
import { RefreshWhile } from "@/components/navigation/refresh-while";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reimbursement" };

export default async function MemberReimbursementPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, { id }] = await Promise.all([requireMember(), params]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("reimbursements")
    .select("id, full_name, description, category, amount, status, reimbursed, denial_reason, submitted_at, payment_method, receipt_path")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) return <p role="alert" className="form-message">We couldn’t load this reimbursement. Please refresh and try again.</p>;
  if (!row) notFound();

  // Flat receipt filenames don't satisfy the legacy folder-based storage RLS.
  // Elevate only AFTER the session-scoped query confirms record ownership;
  // never accept an arbitrary receipt path from the browser.
  const { data: receipt } = await createAdminClient().storage.from("receipts").createSignedUrl(row.receipt_path, 1_200);
  const status = memberStatus(row.status);
  return <>
    <RefreshWhile active={row.status === "pending"} />
    <Link href="/history" className="text-sm text-brand underline">← My reimbursements</Link>
    <div className="my-5"><h1 className="page-title">Reimbursement details</h1></div>
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">{status.label}</h2><span className="font-semibold text-brand">{memberPaymentStatus(row.status, row.reimbursed)}</span></div>
      <p className="mt-2 text-sm text-muted">{status.explanation}</p>
      {row.status === "denied" && row.denial_reason && <p className="mt-2 text-sm text-ink"><span className="font-semibold">Reason for denial:</span> {row.denial_reason}</p>}
      {row.reimbursed && <p className="mt-2 text-sm text-muted">A treasurer has marked this request as paid.</p>}
      {row.status === "approved" && !row.reimbursed && <p className="mt-2 text-sm text-muted">Payment has not yet been marked as sent.</p>}
    </section>
    <section className="card mb-5 p-5"><h2 className="mb-4 font-semibold">Expense details</h2><dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      {[["Amount", formatMoney(row.amount)], ["Category", formatCategory(row.category)], ["Submitted", memberSubmissionDate(row.submitted_at)], ["Submitted name", row.full_name], ["Payment method", row.payment_method], ["Description", row.description]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-ink">{value}</dd></div>)}
    </dl></section>
    <section className="card p-5"><h2 className="mb-3 font-semibold">Submitted receipt</h2>
      {receipt?.signedUrl ? <><a href={receipt.signedUrl} target="_blank" rel="noopener noreferrer" className="mb-3 inline-block text-sm text-brand underline">Open full-size receipt ↗</a>
        {/* Signed private Storage URLs are already optimized receipt images. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={receipt.signedUrl} alt={`Receipt for ${row.description.slice(0, 120)}`} className="h-auto w-full border border-rule" />
      </> : <p className="text-sm text-muted">The receipt couldn’t be loaded. Reload the page to try again.</p>}
    </section>
  </>;
}
