import "server-only";

import { createHash } from "node:crypto";

import { backendKey, backendOrigin } from "./host-backend";
import { defaultDocuments } from "./host-order-documents";
import { getOrderFresh } from "./host-orders";
import type { OrderDocument } from "./host-orders-types";
import { currentRevision, contractWasSent, eventToday } from "./host-event";
import { hostingEmailConfig, hostingTermsHash, type EmailPreview } from "./host-email";
import { listSigning } from "./host-signing";
import { escapeEmail } from "./host-email-template";
import { formatDateISO } from "./host-format";
import { orderPaymentSchedule } from "./host-payment-schedule";
import { HOSTING_EVIDENCE_BUCKET, loadDepositSettlement } from "./host-settlement";
import { loadWorkflow, workflowDb } from "./host-workflow";
import { createAdminClient } from "./reimbursements/supabase/admin";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function filenameFrom(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallback;
}

async function creditMemo(order: NonNullable<Awaited<ReturnType<typeof getOrderFresh>>>, settlement: NonNullable<Awaited<ReturnType<typeof loadDepositSettlement>>>, amount: number) {
  const depositNumber = order.documents.filter(document => document.kind === "deposit_invoice" && !document.stale).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]?.number;
  const defaults = defaultDocuments(order, depositNumber);
  const payload: Record<string, unknown> = {
    ...defaults.payloads.credit_memo,
    amount: amount.toFixed(2),
    refund_method: amount > 0 ? settlement.refundMethod.trim() || "a payment method to be confirmed" : "No refund",
    refund_description: "Security deposit settlement with itemized deductions.",
    deposit_amount: settlement.depositAmount.toFixed(2),
    deductions: settlement.items.map(item => ({ description: item.description, amount: item.amount.toFixed(2) })),
    _document_source: order.snapshot,
  };
  const response = await fetch(`${backendOrigin()}/api/generate/credit-memo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": backendKey()! },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("The credit memo could not be generated. No email was sent.");
  if (response.headers.get("x-deposit-settlement") !== "itemized-v1") throw new Error("The PDF service needs its itemized settlement update. No email was sent.");
  const bytes = Buffer.from(await response.arrayBuffer());
  const filename = filenameFrom(response, `deposit-credit-${order.id}.pdf`);
  const number = String(payload.memo_number || filename.replace(/\.pdf$/i, ""));
  const document: Omit<OrderDocument, "id"> = {
    kind: "credit_memo", number, filename, amount, generatedAt: new Date().toISOString(),
    payload, sourceSnapshot: order.snapshot, generationReceipt: response.headers.get("x-document-receipt") ?? undefined,
  };
  return { attachment: { filename, content: bytes.toString("base64"), contentType: "application/pdf" }, document,
    style: response.headers.get("x-deposit-settlement-style") ?? "itemized-v1",
  };
}

export async function prepareHostingSettlementEmail(input: { orderId: string; settlementRevision: number; message?: { subject: string; text: string } }) {
  const [order, revisions, workflow, settlement] = await Promise.all([
    getOrderFresh(input.orderId), listSigning(input.orderId), loadWorkflow(input.orderId), loadDepositSettlement(input.orderId),
  ]);
  if (!order || !settlement) throw new Error("Save the deposit settlement before preparing its email.");
  if (settlement.revision !== input.settlementRevision) throw new Error("The settlement changed. Reload before preparing its email.");
  if (!settlement.items.length) throw new Error("Add at least one deduction.");
  if (order.statusOverride === "cancelled" || workflow.cancelledAt) throw new Error("This event is cancelled.");
  const revision = currentRevision(revisions);
  if (!revision || !contractWasSent(revision, workflow)) throw new Error("Send the contract before preparing a settlement email.");
  if (orderPaymentSchedule(order).eventEndDate > eventToday()) throw new Error("Prepare the settlement after the event ends.");
  const renters = new Set(((order.snapshot.contractSigners ?? []) as { email?: string }[]).map(person => person.email?.trim().toLowerCase()).filter(Boolean));
  const recipients = [...new Set(revision.recipients.filter(person => renters.has(person.email.toLowerCase())).map(person => person.email.toLowerCase()))];
  if (!recipients.length) throw new Error("There are no renting-club recipients for this settlement.");

  const db = workflowDb();
  const [deposits, rentals] = await Promise.all([
    db.from("hosting_deposit_payments").select("amount").eq("order_id", order.id).is("reversed_at", null),
    createAdminClient().from("hosting_finance_payments").select("amount").eq("order_id", order.id).eq("kind", "revenue").is("reversed_at", null),
  ]);
  if (deposits.error || rentals.error) throw new Error("Recorded payments could not be verified.");
  const depositPaid = (deposits.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const rentalPaid = (rentals.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  if (depositPaid < settlement.depositAmount) throw new Error("Record the full deposit before preparing its settlement.");
  if (rentalPaid < (order.rentalPrice ?? Infinity)) throw new Error("Record the full rental payment before preparing the deposit settlement.");

  const total = settlement.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
  const refund = Math.max(settlement.depositAmount - total, 0);
  const memo = await creditMemo(order, settlement, refund);
  const evidenceRows = await db.from("hosting_damage_evidence").select("storage_path,filename,content_type").eq("settlement_id", settlement.id).order("created_at");
  if (evidenceRows.error) throw new Error("Settlement evidence could not be loaded.");
  const evidence = await Promise.all((evidenceRows.data ?? []).map(async row => {
    const file = await db.storage.from(HOSTING_EVIDENCE_BUCKET).download(row.storage_path);
    if (file.error) throw new Error(`“${row.filename}” could not be attached.`);
    return { filename: row.filename.replace(/\.[^.]+$/, "") + ".jpg", content: Buffer.from(await file.data.arrayBuffer()).toString("base64"), contentType: "image/jpeg" };
  }));
  const attachments = [memo.attachment, ...evidence];
  const sender = await hostingEmailConfig();
  const alreadyReturned = !!workflow.refund;
  const plannedMethod = settlement.refundMethod.trim() ? ` via ${settlement.refundMethod.trim()}` : "";
  const plannedDate = settlement.refundDate ? ` by ${formatDateISO(settlement.refundDate)}` : "";
  const action = refund === 0 ? "The full security deposit was applied to the itemized deductions; no balance remains to return."
    : alreadyReturned ? `The remaining ${money(refund)} was returned via ${workflow.refund!.method} on ${formatDateISO(workflow.refund!.date)}.`
      : `We will return the remaining ${money(refund)}${plannedMethod}${plannedDate}.`;
  const lines = settlement.items.map(item => `- ${item.description}: ${money(item.amount)}`).join("\n");
  const attached = evidence.length ? "The itemized credit memo and photographs are attached." : "The itemized credit memo is attached.";
  const defaultText = `Hello everyone,\n\nThank you for hosting your event at Theta Xi on ${formatDateISO(order.eventDate)}. During our post-event inspection, we found damage requiring repair and remediation. Under Section 05 of the Hosting Contract, these costs have been deducted from the ${money(settlement.depositAmount)} security deposit.\n\n${lines}\n\nTotal deductions: ${money(total)}\nDeposit credited for return: ${money(refund)}\n\n${action}\n\n${attached} Please reply with any questions about these deductions.\n\nBest,\nTheta Xi Hosting\nNu Chapter · UC Berkeley\n2639 Durant Ave, Berkeley, CA 94704\n${sender.replyTo}\nhttps://cal.taxi`;
  const rows = settlement.items.map(item => `<tr><td style="padding:8px 0;border-bottom:1px solid #e6e9ee">${escapeEmail(item.description)}</td><td style="padding:8px 0 8px 20px;border-bottom:1px solid #e6e9ee;text-align:right;white-space:nowrap">${escapeEmail(money(item.amount))}</td></tr>`).join("");
  const defaultHtml = `<!doctype html><html><body style="margin:0;background:#f5f6f8;color:#17253a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:32px auto;background:white;padding:36px"><p style="font-size:16px;font-weight:bold;margin:0 0 28px">Theta Xi Hosting</p><h1 style="font-size:24px;line-height:1.3;margin:0 0 24px">Security Deposit Settlement</h1><p style="line-height:1.6">Hello everyone,</p><p style="line-height:1.6">Thank you for hosting your event at Theta Xi on ${escapeEmail(formatDateISO(order.eventDate))}. During our post-event inspection, we found damage requiring repair and remediation. Under Section 05 of the Hosting Contract, these costs have been deducted from the ${escapeEmail(money(settlement.depositAmount))} security deposit.</p><table style="width:100%;border-collapse:collapse;margin:22px 0;font-size:14px">${rows}<tr><td style="padding:12px 0 4px;font-weight:bold">Total deductions</td><td style="padding:12px 0 4px 20px;text-align:right;font-weight:bold">${escapeEmail(money(total))}</td></tr><tr><td style="padding:4px 0;font-weight:bold">Deposit credited for return</td><td style="padding:4px 0 4px 20px;text-align:right;font-weight:bold">${escapeEmail(money(refund))}</td></tr></table><p style="line-height:1.6">${escapeEmail(action)}</p><p style="line-height:1.6">${escapeEmail(attached)} Please reply with any questions about these deductions.</p><p style="line-height:1.6;margin-top:32px">Best,<br><strong>Theta Xi Hosting</strong><br>Nu Chapter · UC Berkeley<br>2639 Durant Ave, Berkeley, CA 94704<br><a href="mailto:${escapeEmail(sender.replyTo)}" style="color:#244c88">${escapeEmail(sender.replyTo)}</a><br><a href="https://cal.taxi" style="color:#244c88">cal.taxi</a></p></div></body></html>`;

  const subject = input.message?.subject ?? `Security Deposit Settlement · ${order.clubName} · ${formatDateISO(order.eventDate)}`;
  const text = input.message?.text ?? defaultText;
  const html = input.message ? `<!doctype html><html><body style="margin:0;background:#f5f6f8;color:#17253a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:32px auto;background:white;padding:36px;line-height:1.6;white-space:pre-wrap">${escapeEmail(text)}</div></body></html>` : defaultHtml;
  const requestParts = ["settlement-itemized-v2", order.id, revision.id, settlement.id, settlement.revision, recipients.slice().sort(), subject, text];
  const legacyKey = hash(requestParts);
  const legacy = await db.from("hosting_email_deliveries").select("*").eq("request_key", legacyKey).maybeSingle();
  if (legacy.error) throw new Error("The saved settlement preview could not be loaded.");
  const legacyWasAttempted = legacy.data && (legacy.data.status !== "queued" || legacy.data.attempted_at);
  const requestKey = memo.style === "itemized-v1" || legacyWasAttempted ? legacyKey : hash([...requestParts, memo.style]);
  const existing = requestKey === legacyKey ? legacy : await db.from("hosting_email_deliveries").select("*").eq("request_key", requestKey).maybeSingle();
  if (existing.error) throw new Error("The saved settlement preview could not be loaded.");
  if (!existing.data) {
    const payload = {
      body: { from: sender.from, to: recipients, reply_to: sender.replyTo, subject, text, html, attachments },
      orderVersion: order.updatedAt, termsHash: hostingTermsHash(order), revisionId: revision.id, paymentsHash: hash({ depositPaid, rentalPaid }),
      sharedFinancialEmail: true,
      settlement: { id: settlement.id, revision: settlement.revision, creditMemo: memo.document },
    };
    const inserted = await db.from("hosting_email_deliveries").insert({ request_key: requestKey, order_id: order.id, revision_id: revision.id, kind: "settlement", recipient: recipients.join(", "), payload });
    if (inserted.error) throw new Error("The settlement preview could not be saved. No email was sent.");
  }
  const saved = await db.from("hosting_email_deliveries").select("id,recipient,status,payload").eq("request_key", requestKey).single();
  if (saved.error) throw new Error("The settlement preview could not be loaded.");
  return [{ id: saved.data.id, recipient: saved.data.recipient, status: saved.data.status, replyTo: saved.data.payload.body.reply_to, subject: saved.data.payload.body.subject, text: saved.data.payload.body.text, html: saved.data.payload.body.html, attachments: saved.data.payload.body.attachments.map((attachment: { filename: string }) => attachment.filename) }] satisfies (EmailPreview & { text: string })[];
}
