"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { setReimbursementStatus } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import type { ReimbursementStatus } from "@/components/reimbursements/inline-status-select";
import { formatStatus } from "@/lib/reimbursements/format";

type ReviewStatusState = {
  change: (status: "approved" | "denied", denialReason?: string) => Promise<boolean>;
  denialReason: string;
  error: string;
  pending: boolean;
  status: ReimbursementStatus;
};

const ReviewStatusContext = createContext<ReviewStatusState | null>(null);

export function ReviewStatusProvider({ children, initialDenialReason = "", reimbursementId, status: serverStatus }: {
  children: ReactNode;
  initialDenialReason?: string;
  reimbursementId: string;
  status: ReimbursementStatus;
}) {
  const [status, setStatus] = useState(serverStatus);
  const [denialReason, setDenialReason] = useState(initialDenialReason);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mutationId = useRef(0);

  useEffect(() => {
    if (pending) return;
    const timer = window.setTimeout(() => {
      setStatus(serverStatus);
      setDenialReason(initialDenialReason);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pending, serverStatus, initialDenialReason]);

  async function change(next: "approved" | "denied", note = "") {
    if (pending) return false;
    const previous = status;
    const previousReason = denialReason;
    const currentMutation = ++mutationId.current;
    setStatus(next);
    setDenialReason(next === "denied" ? note : "");
    setPending(true);
    setError("");
    try {
      const result = await setReimbursementStatus(reimbursementId, next, next === "denied" ? note : undefined);
      if (!result.ok) throw new Error(result.message);
      return true;
    } catch (reason) {
      if (mutationId.current === currentMutation) {
        setStatus(previous);
        setDenialReason(previousReason);
        setError(reason instanceof Error ? reason.message : "Unable to save the review decision.");
      }
      return false;
    } finally {
      if (mutationId.current === currentMutation) setPending(false);
    }
  }

  return <ReviewStatusContext.Provider value={{ change, denialReason, error, pending, status }}>{children}</ReviewStatusContext.Provider>;
}

function useReviewStatus() {
  const value = useContext(ReviewStatusContext);
  if (!value) throw new Error("Review controls must be inside ReviewStatusProvider.");
  return value;
}

export function ReviewStatusBadge() {
  const { status } = useReviewStatus();
  return <span className={`badge badge-${status}`}>{formatStatus(status)}</span>;
}

export function ReviewDecisionButtons({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
  const { change, denialReason, error, pending, status } = useReviewStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [denyOpen, setDenyOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (denyOpen && !dialog.open) dialog.showModal();
    if (!denyOpen && dialog.open) dialog.close();
  }, [denyOpen]);

  function openDenyDialog() {
    setNote(denialReason);
    setDenyOpen(true);
  }

  async function confirmDenial() {
    if (await change("denied", note.trim())) setDenyOpen(false);
  }

  return <>
    <Button compact={compact} disabled={disabled || pending || status === "approved"} onClick={() => change("approved")} variant="primary">
      {status === "approved" ? "Approved" : compact ? "Approve" : "Approve submission"}
    </Button>
    <Button compact={compact} disabled={disabled || pending || status === "denied"} onClick={openDenyDialog} variant="danger">
      {status === "denied" ? "Denied" : compact ? "Deny" : "Deny submission"}
    </Button>
    {status === "denied" && denialReason && !compact
      ? <p className="m-0 text-[13px] leading-relaxed text-muted"><span className="font-semibold text-ink">Denial reason:</span> {denialReason}</p>
      : null}
    {error && !denyOpen ? <p className="form-message" role="alert">{error}</p> : null}
    <dialog
      aria-labelledby="denial-note-heading"
      className="payment-review-dialog"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else setDenyOpen(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setDenyOpen(false);
      }}
      onClose={() => setDenyOpen(false)}
      ref={dialogRef}
    >
      <div className="payment-review-heading">
        <div>
          <p className="page-eyebrow m-0">Review decision</p>
          <h2 id="denial-note-heading">Deny submission</h2>
        </div>
        <button aria-label="Close denial dialog" className="payment-review-close" disabled={pending} onClick={() => setDenyOpen(false)} type="button">×</button>
      </div>
      <div className="grid gap-2 px-6 pt-4">
        <label className="field-label" htmlFor="denial-note">Why is this being denied? (optional)</label>
        <textarea
          className="field-textarea"
          disabled={pending}
          id="denial-note"
          maxLength={500}
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder="For example: the receipt is illegible, or the expense is not covered."
          rows={3}
          value={note}
        />
        <p className="field-hint">The member sees this note with their denied request.</p>
      </div>
      {error ? <p className="payment-dialog-error" role="alert">{error}</p> : null}
      <div className="payment-review-actions">
        <Button variant="secondary" disabled={pending} onClick={() => setDenyOpen(false)} type="button">Cancel</Button>
        <Button variant="danger" disabled={pending} onClick={confirmDenial} type="button">
          {pending ? "Denying…" : "Deny submission"}
        </Button>
      </div>
    </dialog>
  </>;
}
