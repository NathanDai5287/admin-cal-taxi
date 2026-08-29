"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { formatStatus } from "@/lib/reimbursements/format";

type ReimbursementStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "approved"
  | "denied"
  | "processing_failed";

export function InlineStatusSelect({ status }: { status: ReimbursementStatus }) {
  const { pending } = useFormStatus();
  const [selectedStatus, setSelectedStatus] = useState(status);
  const isProcessing = status === "pending";

  return (
    <select
      aria-label={`Change status from ${formatStatus(status)}`}
      className={`inline-status-select badge-${selectedStatus}`}
      disabled={pending || isProcessing}
      name="status"
      onChange={(event) => {
        setSelectedStatus(event.currentTarget.value as ReimbursementStatus);
        event.currentTarget.form?.requestSubmit();
      }}
      value={selectedStatus}
    >
      {status !== "approved" && status !== "denied" && (
        <option value={status}>{formatStatus(status)}</option>
      )}
      <option value="approved">approved</option>
      <option value="denied">denied</option>
    </select>
  );
}
