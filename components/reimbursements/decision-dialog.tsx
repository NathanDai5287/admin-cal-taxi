"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { ReviewDecision } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function DecisionDialog({ status, memberName, amount, requestedAmount, onCancel, onConfirm }: {
  status: ReviewDecision["status"];
  memberName?: string;
  amount: number;
  requestedAmount: number;
  onCancel: () => void;
  onConfirm: (decision: ReviewDecision) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const amountId = useId();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [amountText, setAmountText] = useState(Number(amount).toFixed(2));
  const approving = status === "approved";
  const amountValid = MONEY_PATTERN.test(amountText.trim()) && Number(amountText) > 0;

  useEffect(() => dialogRef.current!.showModal(), []);

  function confirm(event: FormEvent) {
    event.preventDefault();
    onConfirm({ status, note: note.trim(), ...(approving ? { amount: Number(amountText) } : {}) });
  }

  return (
    <dialog ref={dialogRef} className="payment-review-dialog" aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form onSubmit={confirm}>
        <div className="payment-review-heading">
          <div>
            <p className="page-eyebrow m-0">Review decision</p>
            <h2 id={headingId}>{approving ? "Approve" : "Deny"} {memberName ? `${memberName}’s request` : "submission"}</h2>
          </div>
          <button aria-label="Close decision dialog" className="payment-review-close" onClick={onCancel} type="button">×</button>
        </div>
        <div className="grid gap-2 px-6 pt-4">
          {approving && <>
            <label className="field-label" htmlFor={amountId}>Approved amount</label>
            <input className="field-input" id={amountId} inputMode="decimal" onChange={(event) => setAmountText(event.currentTarget.value)} required value={amountText} />
            <p className="field-hint">The member asked for {formatMoney(requestedAmount)}.</p>
          </>}
          <label className="field-label" htmlFor={noteId}>{approving ? "Message to the member (optional)" : "Why is this being denied?"}</label>
          <textarea
            className="field-textarea"
            id={noteId}
            maxLength={500}
            onChange={(event) => setNote(event.currentTarget.value)}
            required={!approving}
            placeholder={approving ? "For example: approved for the receipt total without the tip." : "For example: the receipt is illegible, or the expense is not covered."}
            rows={3}
            value={note}
          />
          <p className="field-hint">The member gets an email with this decision and note.</p>
        </div>
        <div className="payment-review-actions">
          <Button variant="secondary" onClick={onCancel} type="button">Cancel</Button>
          <Button variant={approving ? "primary" : "danger"} disabled={approving ? !amountValid : !note.trim()} type="submit">
            {approving ? "Approve submission" : "Deny submission"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
