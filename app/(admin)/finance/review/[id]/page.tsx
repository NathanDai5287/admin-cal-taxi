import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PayableDetailView } from "@/components/reimbursements/payable-detail-view";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { payableDetailData } from "@/lib/reimbursements/payable-detail-data";
import { getReceiptPreviewUrls } from "@/lib/reimbursements/receipt-preview-urls";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Review submission" };
export const dynamic = "force-dynamic";

export default async function SubmissionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([requireAdmin(), params]);
  const supabase = createAdminClient();
  const { data: reimbursement } = await supabase
    .from("reimbursements")
    .select("id, full_name, category, amount, description, payment_method, receipt_path, status, reimbursed, merchant, receipt_date, receipt_total, failure_reason, denial_reason, submitted_at")
    .eq("id", id)
    .single();

  if (!reimbursement) notFound();

  const previewUrls = await getReceiptPreviewUrls([reimbursement.receipt_path]);
  const detail = payableDetailData(reimbursement, previewUrls.get(reimbursement.receipt_path) ?? null);
  return <PayableDetailView detail={detail} />;
}
