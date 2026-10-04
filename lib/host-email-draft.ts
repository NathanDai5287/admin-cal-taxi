import { hostingEmail } from "./host-email-template";
import type { EmailKind } from "./host-event";
import type { EmailPreview, EmailRequest } from "./host-email";
import type { Order } from "./host-orders-types";
import type { SigningRevision } from "./host-signing";

// Uses the same renderer as delivery, without a network or PDF dependency.
// Empty IDs make this immediate draft impossible to send before preparation.
export function hostingEmailDraft(order: Order, revision: SigningRevision, kind: EmailKind, rentalPaid: number, replyTo: string, refund?: EmailRequest["refund"]): EmailPreview[] {
  const signing = kind === "invitation" || kind === "reminder";
  const renters = new Set(((order.snapshot.contractSigners ?? []) as { email?: string }[]).map(p => p.email?.trim().toLowerCase()));
  const detail = kind === "receipt" ? `Rental payments received: $${rentalPaid.toFixed(2)}. Remaining rental fee: $${Math.max((order.rentalPrice ?? 0) - rentalPaid, 0).toFixed(2)}.` : kind === "refund" && refund ? `Deposit returned: $${refund.amount.toFixed(2)} on ${refund.date} via ${refund.method}.` : "";
  return revision.recipients.filter(p => signing ? p.status !== "SIGNED" : kind === "completed" || renters.has(p.email.toLowerCase())).map(person => ({
    id: "", recipient: person.email, ...hostingEmail({ kind, name: person.name, organization: order.clubName, eventDate: order.eventDate, link: person.link, detail, replyTo }), attachments: [], status: "draft",
  }));
}
