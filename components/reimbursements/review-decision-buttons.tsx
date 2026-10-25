"use client";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { setReimbursementStatus, type ReviewDecision } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import { DecisionDialog } from "@/components/reimbursements/decision-dialog";
import type { ReimbursementStatus } from "@/lib/reimbursements/format";
import { ReopenApprovalDialog } from "@/components/reimbursements/reopen-approval-dialog";
import { formatStatus, type ReimbursementCategory } from "@/lib/reimbursements/format";

type ReviewStatusState = {
  amount: number;
  change: (decision: ReviewDecision) => Promise<boolean>;
  error: string;
  note: string;
  pending: boolean;
  requestedAmount: number;
  status: ReimbursementStatus;
};

const ReviewStatusContext = createContext<ReviewStatusState | null>(null);

export function ReviewStatusProvider({ amount, children, initialNote = "", reimbursementId, requestedAmount, status: serverStatus }: {
  amount: number;
  children: ReactNode;
  initialNote?: string;
  reimbursementId: string;
  requestedAmount: number;
  status: ReimbursementStatus;
}) {
  const [status, setStatus] = useState(serverStatus);
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reopenTarget, setReopenTarget] = useState<{ category: ReimbursementCategory; decision: ReviewDecision } | null>(null);
  const mutationId = useRef(0);

  useEffect(() => {
    if (pending) return;
    const timer = window.setTimeout(() => {
      setStatus(serverStatus);
      setNote(initialNote);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pending, serverStatus, initialNote]);

  async function change(decision: ReviewDecision, reopenCategory?: ReimbursementCategory) {
    if (pending) return false;
    const previous = status;
    const previousNote = note;
    const currentMutation = ++mutationId.current;
    setStatus(decision.status);
    setNote(decision.note);
    setPending(true);
    setError("");
    let reopenRequired = false;
    try {
      const result = await setReimbursementStatus(reimbursementId, decision, reopenCategory);
      if (!result.ok) {
        reopenRequired = Boolean(result.completedCategory && !reopenCategory);
        if (result.completedCategory) setReopenTarget({ category: result.completedCategory, decision });
        throw new Error(result.message);
      }
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

  async function reopenAndApprove() {
    if (reopenTarget && await change(reopenTarget.decision, reopenTarget.category)) setReopenTarget(null);
  }

  return <ReviewStatusContext.Provider value={{ amount, change, error, note, pending, requestedAmount, status }}>
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
  const { amount, change, error, note, pending, requestedAmount, status } = useReviewStatus();
  const [decision, setDecision] = useState<ReviewDecision["status"] | null>(null);

  function confirm(next: ReviewDecision) {
    setDecision(null);
    void change(next);
  }

  return <>
    <Button compact={compact} disabled={!canWrite || disabled || pending || status === "approved"} onClick={() => setDecision("approved")} variant="primary">
      {status === "approved" ? "Approved" : compact ? "Approve" : "Approve submission"}
    </Button>
    <Button compact={compact} disabled={!canWrite || disabled || pending || status === "denied"} onClick={() => setDecision("denied")} variant="danger">
      {status === "denied" ? "Denied" : compact ? "Deny" : "Deny submission"}
    </Button>
    {(status === "denied" || status === "approved") && note && !compact
      ? <p className="m-0 text-[13px] leading-relaxed text-muted"><span className="font-semibold text-ink">{status === "denied" ? "Denial reason:" : "Message to the member:"}</span> {note}</p>
      : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {decision && <DecisionDialog
      amount={amount}
      onCancel={() => setDecision(null)}
      onConfirm={confirm}
      requestedAmount={requestedAmount}
      status={decision}
    />}
  </>;
}
