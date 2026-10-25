import "server-only";

import { Resend } from "resend";
import { prepareTrackedEmail, recordEmailProvider } from "../email-tracking";
import { escapeEmail } from "../host-email-template";
import { formatMoney } from "./format";
import { publicSiteUrls } from "./send-invite-email";
import { createAdminClient } from "./supabase/admin";

type MemberEmail = { reimbursementId: string; recipient: string; subject: string; lines: string[]; event: string };

async function loadRequest(reimbursementId: string) {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase.from("reimbursements")
    .select("id, user_id, description, status, reimbursed, amount, requested_amount, approval_note, denial_reason, payment_method, updated_at")
    .eq("id", reimbursementId).single();
  if (error) throw new Error(`Unable to load the reimbursement for its email: ${error.message}`);
  if (!row.user_id) return null;
  const { data: member } = await supabase.from("profiles").select("email").eq("id", row.user_id).single();
  return member?.email ? { row, recipient: member.email } : null;
}

async function sendMemberEmail({ reimbursementId, recipient, subject, lines, event }: MemberEmail) {
  const link = `${publicSiteUrls().submitUrl}/history/${reimbursementId}`;
  const html = `
    <div style="font-family:Georgia,Times,'Times New Roman',serif;line-height:1.5;color:#1a1714;max-width:520px">
      ${lines.map((line) => `<p style="margin:0 0 16px">${escapeEmail(line)}</p>`).join("\n")}
      <p style="margin:0"><a href="${link}" style="color:#8c1d18">View your request</a></p>
    </div>
  `.trim();
  const text = [...lines, `View your request: ${link}`].join("\n\n");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Reimbursement email is not configured. Set RESEND_API_KEY.");
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "Theta Xi <reimbursements@cal.taxi>";
  const key = `reimbursement/${reimbursementId}/${event}`;
  const tracked = await prepareTrackedEmail({ from, to: recipient, subject, text, html }, {
    key, kind: "reimbursement", relatedId: reimbursementId, recipient,
  });
  const result = await new Resend(apiKey).emails.send(tracked.body, { idempotencyKey: key });
  if (result.error) throw new Error(`Reimbursement email failed: ${result.error.message}`);
  await recordEmailProvider(tracked.id, result.data.id);
}

export async function sendDecisionEmail(reimbursementId: string) {
  const request = await loadRequest(reimbursementId);
  if (!request || (request.row.status !== "approved" && request.row.status !== "denied")) return;
  const { row } = request;
  const approved = row.status === "approved";
  const note = approved ? row.approval_note : row.denial_reason;
  const amountLine = approved
    ? `It was approved for ${formatMoney(row.amount)}${row.requested_amount === null ? "" : ` instead of the ${formatMoney(row.requested_amount)} you asked for`}.`
    : "It was denied.";
  await sendMemberEmail({
    reimbursementId, recipient: request.recipient, event: row.updated_at,
    subject: approved ? "Your reimbursement was approved" : "Your reimbursement was denied",
    lines: [
      `Your reimbursement request for "${row.description}" has a decision.`,
      amountLine,
      ...(note ? [`${approved ? "Note" : "Reason"} from the reviewer: ${note}`] : []),
      ...(approved ? ["The treasurer will send the payment by Zelle."] : []),
    ],
  });
}

export async function sendPaidEmail(reimbursementId: string) {
  const request = await loadRequest(reimbursementId);
  if (!request?.row.reimbursed) return;
  const { row } = request;
  await sendMemberEmail({
    reimbursementId, recipient: request.recipient, event: `paid/${row.updated_at}`,
    subject: "Your reimbursement was paid",
    lines: [
      `Your reimbursement request for "${row.description}" was paid.`,
      `The treasurer sent ${formatMoney(row.amount)} by Zelle to ${row.payment_method}.`,
    ],
  });
}
