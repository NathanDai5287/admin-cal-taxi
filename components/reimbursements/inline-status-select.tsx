"use client";

import { formatStatus } from "@/lib/reimbursements/format";

export type ReimbursementStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "approved"
  | "denied"
  | "processing_failed";

export function InlineStatusSelect({
  disabled = false,
  onChange,
  status,
}: {
  disabled?: boolean;
  onChange: (status: ReimbursementStatus) => void;
  status: ReimbursementStatus;
}) {
  const isProcessing = status === "pending";

  return (
    <select
      aria-label={`Change status from ${formatStatus(status)}`}
      className={`inline-status-select badge-${status}`}
      disabled={disabled || isProcessing}
      onChange={(event) => onChange(event.currentTarget.value as ReimbursementStatus)}
      value={status}
    >
      {status !== "approved" && status !== "denied" && (
        <option value={status}>{formatStatus(status)}</option>
      )}
      <option value="approved">approved</option>
      <option value="denied">denied</option>
    </select>
  );
}
