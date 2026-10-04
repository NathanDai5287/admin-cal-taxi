import type { SigningPerson, SigningRevision } from "./host-signing";

export type EventStage = "draft" | "sent" | "signed" | "held" | "cancelled";
export const EVENT_STAGE_LABELS: Record<EventStage, string> = {
  draft: "Draft", sent: "Sent", signed: "Signed", held: "Event held", cancelled: "Cancelled",
};
export type EventProgress = { stage: EventStage; signed: number; total: number; unavailable?: boolean };
export type EmailKind = "invitation" | "reminder" | "completed" | "deposit_invoice" | "rental_invoice" | "receipt" | "refund";
export const EMAIL_LABELS: Record<EmailKind, string> = {
  invitation: "Contract invitation", reminder: "Signing reminder", completed: "Signed contract",
  deposit_invoice: "Deposit invoice", rental_invoice: "Rental invoice", receipt: "Rental payment receipt", refund: "Deposit return confirmation",
};
export type EmailDelivery = { id: string; revision_id: string | null; kind: EmailKind; recipient: string; status: string; sent_at: string | null; created_at: string; error: string | null };
export type EventWorkflow = {
  activatedAt: string; cancelledAt: string | null; deliveries: EmailDelivery[];
  refund: { amount: number; date: string; method: string } | null;
};
export type SignerProgress = { state: "signed" | "pending" | "not_sent" | "unconfirmed"; label: string };
export function signerProgress(person: SigningPerson, revision: SigningRevision, workflow: EventWorkflow): SignerProgress {
  if (person.status === "SIGNED") return { state: "signed", label: "Signed" };
  const deliveries = workflow.deliveries.filter(delivery => delivery.revision_id === revision.id
    && delivery.recipient.trim().toLowerCase() === person.email.trim().toLowerCase()
    && (delivery.kind === "invitation" || delivery.kind === "reminder"));
  if (person.sentAt || deliveries.some(delivery => delivery.status === "sent")) {
    return { state: "pending", label: "Pending signature — invitation sent" };
  }
  // Preserve previously shared signing requests without claiming tracked email delivery.
  if (revision.envelope_id && Date.parse(revision.created_at) < Date.parse(workflow.activatedAt)) {
    return { state: "pending", label: "Pending signature — signing request predates email tracking" };
  }
  if (deliveries.some(delivery => ["sending", "failed", "uncertain"].includes(delivery.status))) {
    return { state: "unconfirmed", label: "Email delivery unconfirmed — check email activity" };
  }
  return { state: "not_sent", label: "Invitation not sent" };
}
export function eventToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function currentRevision(revisions: SigningRevision[]) {
  // A newer preview does not supersede the active agreement.
  return [...revisions].sort((a, b) => b.revision - a.revision)
    .find(r => ["awaiting_signatures", "preparing_completed_copy", "signed"].includes(r.state)) ?? null;
}
export function contractWasSent(revision: SigningRevision | null, workflow: EventWorkflow) {
  return !!revision && (revision.state === "signed" || revision.signedCount > 0
    || revision.recipients.some(p => !!p.sentAt)
    || (!!revision.envelope_id && Date.parse(revision.created_at) < Date.parse(workflow.activatedAt))
    || workflow.deliveries.some(d => d.revision_id === revision.id && d.kind === "invitation" && d.status === "sent"));
}
export function eventProgress(eventDate: string, revisions: SigningRevision[], workflow: EventWorkflow, today = eventToday(), legacyCancelled = false): EventProgress {
  const revision = currentRevision(revisions);
  const counts = { signed: revision?.signedCount ?? 0, total: revision?.totalCount ?? 0 };
  if (workflow.cancelledAt || legacyCancelled) return { stage: "cancelled", ...counts };
  if (!contractWasSent(revision, workflow)) return { stage: "draft", ...counts };
  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate) && eventDate < today) return { stage: "held", ...counts };
  return { stage: revision?.state === "signed" || (counts.total > 0 && counts.signed >= counts.total) ? "signed" : "sent", ...counts };
}
