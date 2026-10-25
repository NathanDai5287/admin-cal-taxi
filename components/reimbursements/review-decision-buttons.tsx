"use client";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { setReimbursementPaid } from "@/app/(admin)/finance/accounts/payable/actions";
import { setReimbursementStatus, type ReviewDecision } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import { ResendEmailButton } from "@/components/email/resend-email-button";
import { DecisionDialog } from "@/components/reimbursements/decision-dialog";
import type { EmailFailure } from "@/lib/email-send";
import type { ReimbursementStatus } from "@/lib/reimbursements/format";
import { ReopenApprovalDialog } from "@/components/reimbursements/reopen-approval-dialog";
import { formatStatus, type ReimbursementCategory } from "@/lib/reimbursements/format";

type ReviewStatusState = {
  amount: number;
  change: (decision: ReviewDecision) => Promise<boolean>;
  changePaid: (reimbursed: boolean) => Promise<void>;
  emailFailure: SavedEmailFailure | null;
  error: string;
  note: string;
  pending: boolean;
  reimbursed: boolean;
  requestedAmount: number;
  status: ReimbursementStatus;
};
type SavedEmailFailure = EmailFailure & { saved: "decision" | "payment" };

const ReviewStatusContext = createContext<ReviewStatusState | null>(null);

export function ReviewStatusProvider({ amount, children, initialNote = "", reimbursed: serverReimbursed, reimbursementId, requestedAmount, status: serverStatus }: {
  amount: number;
  children: ReactNode;
  initialNote?: string;
  reimbursed: boolean;
  reimbursementId: string;
  requestedAmount: number;
  status: ReimbursementStatus;
}) {
  const [status, setStatus] = useState(serverStatus);
  const [note, setNote] = useState(initialNote);
  const [reimbursed, setReimbursed] = useState(serverReimbursed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [emailFailure, setEmailFailure] = useState<SavedEmailFailure | null>(null);
  const [reopenTarget, setReopenTarget] = useState<{ category: ReimbursementCategory; decision: ReviewDecision } | null>(null);
  const mutationId = useRef(0);

  useEffect(() => {
    if (pending) return;
    const timer = window.setTimeout(() => {
      setStatus(serverStatus);
      setNote(initialNote);
      setReimbursed(serverReimbursed);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pending, serverStatus, initialNote, serverReimbursed]);

  async function change(decision: ReviewDecision, reopenCategory?: ReimbursementCategory) {
    if (pending) return false;
    const previous = status;
    const previousNote = note;
    const currentMutation = ++mutationId.current;
    setStatus(decision.status);
    setNote(decision.note);
    setPending(true);
    setError("");
    setEmailFailure(null);
    let reopenRequired = false;
    try {
      const result = await setReimbursementStatus(reimbursementId, decision, reopenCategory);
      if (!result.ok) {
        reopenRequired = Boolean(result.completedCategory && !reopenCategory);
        if (result.completedCategory) setReopenTarget({ category: result.completedCategory, decision });
        throw new Error(result.message);
      }
      setEmailFailure(result.emailFailure ? { ...result.emailFailure, saved: "decision" } : null);
      return true;
    } catch (reason) {
      if (mutationId.current === currentMutation) {
        setStatus(previous);
        setNote(previousNote);
        const message = reason instanceof Error ? reason.message : "Unable to save the review decision.";
        setError(reopenRequired ? "" : message);
      }
      return false;
    } finally {
      if (mutationId.current === currentMutation) setPending(false);
    }
  }

  async function changePaid(next: boolean) {
    if (pending) return;
    setReimbursed(next);
    setPending(true);
    setError("");
    setEmailFailure(null);
    try {
      const result = await setReimbursementPaid(reimbursementId, next);
      if (!result.ok) throw new Error(result.message);
      if (result.emailFailure) setEmailFailure({ ...result.emailFailure, saved: "payment" });
    } catch (reason) {
      setReimbursed(!next);
      setError(reason instanceof Error ? reason.message : "Unable to change the payment state.");
    } finally {
      setPending(false);
    }
  }

  async function reopenAndApprove() {
    if (reopenTarget && await change(reopenTarget.decision, reopenTarget.category)) setReopenTarget(null);
  }

  return <ReviewStatusContext.Provider value={{ amount, change, changePaid, emailFailure, error, note, pending, reimbursed, requestedAmount, status }}>
    {children}
    <ReopenApprovalDialog category={reopenTarget?.category ?? null} error={error} pending={pending} onCancel={() => setReopenTarget(null)} onConfirm={reopenAndApprove} />
  </ReviewStatusContext.Provider>;
}

function useReviewStatus() {
  const value = useContext(ReviewStatusContext);
  if (!value) throw new Error("Review controls must be inside ReviewStatusProvider.");
  return value;
}

export function ReviewStatusBadge() {
  const { amount, requestedAmount, status } = useReviewStatus();
  const amountChanged = status === "approved" && amount !== requestedAmount;
  return <span className={`badge badge-${status}`}>{formatStatus(status)}{amountChanged && " · amount changed"}</span>;
}

export function ReviewDecisionButtons({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
  const canWrite = useAppWriteAccess();
  const { amount, change, emailFailure, error, note, pending, reimbursed, requestedAmount, status } = useReviewStatus();
  const [decision, setDecision] = useState<ReviewDecision["status"] | null>(null);

  function confirm(next: ReviewDecision) {
    setDecision(null);
    void change(next);
  }

  return <>
    <Button compact={compact} disabled={!canWrite || disabled || pending || reimbursed || status === "approved"} onClick={() => setDecision("approved")} variant="primary">
      {status === "approved" ? "Approved" : compact ? "Approve" : "Approve submission"}
    </Button>
    <Button compact={compact} disabled={!canWrite || disabled || pending || reimbursed || status === "denied"} onClick={() => setDecision("denied")} variant="danger">
      {status === "denied" ? "Denied" : compact ? "Deny" : "Deny submission"}
    </Button>
    {!compact && <PaidButton />}
    {(status === "denied" || status === "approved") && note && !compact
      ? <p className="m-0 text-[13px] leading-relaxed text-muted"><span className="font-semibold text-ink">{status === "denied" ? "Denial reason:" : "Message to the member:"}</span> {note}</p>
      : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {emailFailure && !compact ? <div className="grid justify-items-start gap-2">
      <p className="form-message" role="alert">The {emailFailure.saved} is saved, but the email to the member was not sent: {emailFailure.error}</p>
      {emailFailure.messageId && <ResendEmailButton messageId={emailFailure.messageId} />}
    </div> : null}
    {decision && <DecisionDialog
      amount={amount}
      onCancel={() => setDecision(null)}
      onConfirm={confirm}
      requestedAmount={requestedAmount}
      status={decision}
    />}
  </>;
}

function PaidButton() {
  const canWrite = useAppWriteAccess();
  const { changePaid, pending, reimbursed, status } = useReviewStatus();
  if (status !== "approved") return null;
  return <Button disabled={!canWrite || pending} onClick={() => void changePaid(!reimbursed)} variant="secondary">
    {reimbursed ? "Mark as unpaid" : "Mark as paid"}
  </Button>;
}

export function PaidNotice() {
  const { reimbursed } = useReviewStatus();
  return reimbursed ? <p>This reimbursement has been paid. To change the decision, first mark it unpaid.</p> : null;
}
