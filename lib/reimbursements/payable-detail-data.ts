import type { ReimbursementStatus } from "@/components/reimbursements/inline-status-select";
import { formatMoney } from "@/lib/reimbursements/format";

export type PayableDetailData = {
  id: string;
  name: string;
  amount: string;
  receiptUrl: string | null;
  category: string;
  description: string;
  merchant: string | null;
  paymentMethod: string;
  receiptDate: string | null;
  submittedAt: string;
  tabscannerTotal: string;
  totalsMatch: boolean;
  comparisonMessage: string;
  denialReason: string;
  reimbursed: boolean;
  status: ReimbursementStatus;
};

type PayableDetailSource = {
  id: string;
  full_name: string;
  amount: number | string;
  category: string;
  description: string;
  merchant: string | null;
  payment_method: string;
  receipt_date: string | null;
  submitted_at: string;
  receipt_total: number | string | null;
  failure_reason: string | null;
  denial_reason: string | null;
  reimbursed: boolean;
  status: ReimbursementStatus;
};

export function payableDetailData(row: PayableDetailSource, receiptUrl: string | null): PayableDetailData {
  const totalsMatch = row.receipt_total !== null
    && Math.round(Number(row.amount) * 100) === Math.round(Number(row.receipt_total) * 100);

  return {
    id: row.id,
    name: row.full_name,
    amount: formatMoney(row.amount),
    receiptUrl,
    category: row.category,
    description: row.description,
    merchant: row.merchant,
    paymentMethod: row.payment_method,
    receiptDate: row.receipt_date,
    submittedAt: row.submitted_at,
    tabscannerTotal: row.receipt_total === null ? "—" : formatMoney(row.receipt_total),
    totalsMatch,
    comparisonMessage: totalsMatch
      ? "The submitted and scanned totals match."
      : row.status === "pending"
        ? "Tabscanner is still processing this receipt."
        : row.status === "processing_failed"
          ? `Automatic verification failed${row.failure_reason ? `: ${row.failure_reason}` : "."}`
          : "The totals differ and need manual review.",
    denialReason: row.denial_reason ?? "",
    reimbursed: row.reimbursed,
    status: row.status,
  };
}
