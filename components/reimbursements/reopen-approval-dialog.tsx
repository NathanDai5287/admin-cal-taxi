"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/brand/button";
import { formatCategory, type ReimbursementCategory } from "@/lib/reimbursements/format";

export function ReopenApprovalDialog({ category, error, pending, onCancel, onConfirm }: {
  category: ReimbursementCategory | null;
  error: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    if (category && !dialog.open) dialog.showModal();
    if (!category && dialog.open) dialog.close();
  }, [category]);

  return (
    <dialog ref={dialogRef} className="payment-review-dialog" aria-labelledby={headingId} aria-describedby={descriptionId}
      onCancel={(event) => { if (pending) event.preventDefault(); else onCancel(); }}
      onClose={onCancel}
      onClick={(event) => { if (!pending && event.target === event.currentTarget) onCancel(); }}>
      <div className="payment-review-heading"><h2 id={headingId}>Category completed</h2></div>
      <div className="grid gap-2 px-6 pt-4 text-sm leading-relaxed" id={descriptionId}>
        <p><strong className="capitalize">{category ? formatCategory(category).toLowerCase() : "This category"}</strong> is complete. Reopen it before approving this reimbursement.</p>
        <p className="text-muted">The category will stay open for more spending.</p>
      </div>
      {error ? <p className="payment-dialog-error" role="alert">{error}</p> : null}
      <div className="payment-review-actions flex-wrap">
        <Button autoFocus variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button disabled={pending} onClick={onConfirm}>{pending ? "Approving…" : "Reopen and approve"}</Button>
      </div>
    </dialog>
  );
}
