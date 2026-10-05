import { EMAIL_LABELS, type EmailKind } from "./host-event";
import { addDaysIso, formatDateISO } from "./host-format";

export function escapeEmail(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
export function hostingEmail(input: { kind: EmailKind; name: string; organization: string; eventDate: string; link?: string; detail?: string; invoiceAmount?: number; replyTo: string }) {
  const title = EMAIL_LABELS[input.kind];
  const subject = `${title} · ${input.organization} · ${input.eventDate}`;
  const signing = input.kind === "invitation" || input.kind === "reminder";
  const paymentInstructions = input.kind === "deposit_invoice" || input.kind === "rental_invoice"
    ? "You can pay by Zelle at calthetaxi@gmail.com. Would you prefer cash or credit card? Reply to let us know. Credit card payments have a 3% surcharge."
    : "";
  const message = input.kind === "invitation" ? "Please review and sign your hosting agreement using your personal link below."
    : input.kind === "reminder" ? "Your signature is still needed on the hosting agreement. Please use your personal link below to review and sign."
    : input.kind === "completed" ? "Everyone has signed the hosting agreement. Your completed contract and its audit trail are attached for your records."
    : input.kind === "deposit_invoice" ? `Your deposit invoice is attached. The refundable deposit is due ${formatDateISO(addDaysIso(input.eventDate, -7))}. ${sharedInvoiceMessage(input.invoiceAmount)}`
    : input.kind === "rental_invoice" ? `Your rental invoice is attached. The rental fee is due ${formatDateISO(addDaysIso(input.eventDate, 2))}. ${sharedInvoiceMessage(input.invoiceAmount)}`
    : input.kind === "deposit_receipt" ? "Your receipt for the refundable deposit we received is attached. This payment is separate from the rental fee."
    : input.kind === "receipt" ? "Your receipt for the rental payment we received is attached. Thank you."
    : "The deposit return details are attached for your records.";
  const href = input.link && /^https:\/\//.test(input.link) ? escapeEmail(input.link) : "";
  if (signing && !href) throw new Error("A valid personal signing link is required.");
  const text = `Hello ${input.name},\n\n${message}${paymentInstructions ? `\n\n${paymentInstructions}` : ""}\n\n${input.organization}\nEvent: ${input.eventDate}${input.detail ? `\n${input.detail}` : ""}${signing ? `\n\nSign your agreement: ${input.link}\nThis link is personal to you. Please do not forward it.` : ""}\n\nBest,\nTheta Xi Hosting\nNu Chapter · UC Berkeley\n2639 Durant Ave, Berkeley, CA 94704\n${input.replyTo}\nhttps://cal.taxi`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;color:#17253a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:32px auto;background:white;padding:36px"><p style="font-size:16px;font-weight:bold;margin:0 0 28px">Theta Xi Hosting</p><h1 style="font-size:24px;line-height:1.3;margin:0 0 24px">${escapeEmail(title)}</h1><p style="line-height:1.6">Hello ${escapeEmail(input.name)},</p><p style="line-height:1.6">${escapeEmail(message)}</p>${paymentInstructions ? `<p style="line-height:1.6">${escapeEmail(paymentInstructions)}</p>` : ""}<p style="line-height:1.6"><strong>${escapeEmail(input.organization)}</strong><br>Event: ${escapeEmail(input.eventDate)}${input.detail ? `<br>${escapeEmail(input.detail)}` : ""}</p>${signing ? `<p style="margin:28px 0"><a href="${href}" style="display:inline-block;background:#244c88;color:white;padding:13px 20px;text-decoration:none;border-radius:4px">Review and sign agreement</a></p><p style="font-size:13px;line-height:1.6">This link is personal to you. Please do not forward it.</p>` : ""}<p style="line-height:1.6;margin-top:32px">Best,<br><strong>Theta Xi Hosting</strong><br>Nu Chapter · UC Berkeley<br>2639 Durant Ave, Berkeley, CA 94704<br><a href="mailto:${escapeEmail(input.replyTo)}" style="color:#244c88">${escapeEmail(input.replyTo)}</a><br><a href="https://cal.taxi" style="color:#244c88">cal.taxi</a></p></div></body></html>`;
  return { subject, text, html };
}

function sharedInvoiceMessage(amount?: number) {
  const total = amount === undefined ? "The invoiced amount" : `$${amount.toFixed(2)}`;
  return `${total} is the total across all clubs, not an amount owed by each club. Please coordinate payment; it may come from any representative. Include the event date in the payment note.`;
}
