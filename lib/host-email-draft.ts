import { hostingEmail } from "./host-email-template";
import type { EmailKind } from "./host-event";
import type { EmailPreview, EmailRequest } from "./host-email";
import type { Order } from "./host-orders-types";
import type { SigningRevision } from "./host-signing";

// Uses the same renderer as delivery, without a network or PDF dependency.
// Empty IDs make this immediate draft impossible to send before preparation.
export function hostingEmailDraft(order: Order, revision: SigningRevision, kind: EmailKind, rentalPaid: number, replyTo: string, refund?: EmailRequest["refund"], depositPaid = 0): EmailPreview[] {
  const signing = kind === "invitation" || kind === "reminder";
  const renters = new Set(((order.snapshot.contractSigners ?? []) as { email?: string }[]).map(p => p.email?.trim().toLowerCase()));
  const detail = kind === "deposit_receipt" ? `Deposit payments received: $${depositPaid.toFixed(2)}. Remaining deposit: $${Math.max((order.depositAmount ?? 0) - depositPaid, 0).toFixed(2)}.` : kind === "receipt" ? `Rental payments received: $${rentalPaid.toFixed(2)}. Remaining rental fee: $${Math.max((order.rentalPrice ?? 0) - rentalPaid, 0).toFixed(2)}.` : kind === "refund" && refund ? `Deposit returned: $${refund.amount.toFixed(2)} on ${refund.date} via ${refund.method}.` : "";
  if (kind === "deposit_invoice" || kind === "rental_invoice" || kind === "deposit_receipt") {
    const emails = [...new Set(revision.recipients.filter(p => renters.has(p.email.toLowerCase())).map(p => p.email.toLowerCase()))];
    if (!emails.length) return [];
    return [{ id: "", recipient: emails.join(", "), ...hostingEmail({ kind, name: "everyone", organization: order.clubName, eventDate: order.eventDate, detail, invoiceAmount: kind === "deposit_invoice" ? order.depositAmount ?? undefined : kind === "rental_invoice" ? order.rentalPrice ?? undefined : undefined, replyTo }), attachments: [], status: "draft" }];
  }
  return revision.recipients.filter(p => signing ? p.status !== "SIGNED" : kind === "completed" || renters.has(p.email.toLowerCase())).map(person => ({
    id: "", recipient: person.email, ...hostingEmail({ kind, name: person.name, organization: order.clubName, eventDate: order.eventDate, link: person.link, detail, replyTo }), attachments: [], status: "draft",
  }));
}
