"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { setReimbursementStatus } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import type { ReimbursementStatus } from "@/components/reimbursements/inline-status-select";
import { formatStatus } from "@/lib/reimbursements/format";

type ReviewStatusState = {
  change: (status: "approved" | "denied") => Promise<void>;
  error: string;
  pending: boolean;
  status: ReimbursementStatus;
};

const ReviewStatusContext = createContext<ReviewStatusState | null>(null);

export function ReviewStatusProvider({ children, reimbursementId, status: serverStatus }: {
  children: ReactNode;
  reimbursementId: string;
  status: ReimbursementStatus;
}) {
  const [status, setStatus] = useState(serverStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mutationId = useRef(0);

  useEffect(() => {
    if (pending) return;
    const timer = window.setTimeout(() => setStatus(serverStatus), 0);
    return () => window.clearTimeout(timer);
  }, [pending, serverStatus]);

  async function change(next: "approved" | "denied") {
    if (pending) return;
    const previous = status;
    const currentMutation = ++mutationId.current;
    setStatus(next);
    setPending(true);
    setError("");
    try {
      const result = await setReimbursementStatus(reimbursementId, next);
      if (!result.ok) throw new Error(result.message);
    } catch (reason) {
      if (mutationId.current === currentMutation) {
        setStatus(previous);
        setError(reason instanceof Error ? reason.message : "Unable to save the review decision.");
      }
    } finally {
      if (mutationId.current === currentMutation) setPending(false);
    }
  }

  return <ReviewStatusContext.Provider value={{ change, error, pending, status }}>{children}</ReviewStatusContext.Provider>;
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
  const { change, error, pending, status } = useReviewStatus();
  return <>
    <Button compact={compact} disabled={disabled || pending || status === "approved"} onClick={() => change("approved")} variant="primary">
      {status === "approved" ? "Approved" : compact ? "Approve" : "Approve submission"}
    </Button>
    <Button compact={compact} disabled={disabled || pending || status === "denied"} onClick={() => change("denied")} variant="danger">
      {status === "denied" ? "Denied" : compact ? "Deny" : "Deny submission"}
    </Button>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
  </>;
}
