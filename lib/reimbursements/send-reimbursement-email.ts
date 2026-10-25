import "server-only";

import { sendTrackedEmail, type EmailResult } from "../email-send";
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

function sendMemberEmail({ reimbursementId, recipient, subject, lines, event }: MemberEmail) {
  const link = `${publicSiteUrls().submitUrl}/history/${reimbursementId}`;
  const html = `
    <div style="font-family:Georgia,Times,'Times New Roman',serif;line-height:1.5;color:#1a1714;max-width:520px">
      ${lines.map((line) => `<p style="margin:0 0 16px">${escapeEmail(line)}</p>`).join("\n")}
      <p style="margin:0"><a href="${link}" style="color:#8c1d18">View your request</a></p>
    </div>
  `.trim();
  const text = [...lines, `View your request: ${link}`].join("\n\n");

  const from = process.env.RESEND_FROM_EMAIL?.trim() || "Theta Xi <reimbursements@cal.taxi>";
  return sendTrackedEmail({ from, to: recipient, subject, text, html }, {
    key: `reimbursement/${reimbursementId}/${event}`, kind: "reimbursement", relatedId: reimbursementId, recipient,
  });
}

async function neverThrow(send: () => Promise<EmailResult | null>): Promise<EmailResult | null> {
  try {
    return await send();
  } catch (error) {
    return { sent: false, messageId: null, error: error instanceof Error ? error.message : "The email could not be sent." };
  }
}

export const sendDecisionEmail = (reimbursementId: string) => neverThrow(async () => {
  const request = await loadRequest(reimbursementId);
  if (!request || (request.row.status !== "approved" && request.row.status !== "denied")) return null;
  const { row } = request;
  const approved = row.status === "approved";
  const note = approved ? row.approval_note : row.denial_reason;
  const amountLine = approved
    ? `It was approved for ${formatMoney(row.amount)}${row.requested_amount === null ? "" : ` instead of the ${formatMoney(row.requested_amount)} you asked for`}.`
    : "It was denied.";
  return sendMemberEmail({
    reimbursementId, recipient: request.recipient, event: row.updated_at,
    subject: approved ? "Your reimbursement was approved" : "Your reimbursement was denied",
    lines: [
      `Your reimbursement request for "${row.description}" has a decision.`,
      amountLine,
      ...(note ? [`${approved ? "Note" : "Reason"} from the reviewer: ${note}`] : []),
      ...(approved ? ["The treasurer will send the payment by Zelle."] : []),
    ],
  });
});

export const sendPaidEmail = (reimbursementId: string) => neverThrow(async () => {
  const request = await loadRequest(reimbursementId);
  if (!request?.row.reimbursed) return null;
  const { row } = request;
  return sendMemberEmail({
    reimbursementId, recipient: request.recipient, event: `paid/${row.updated_at}`,
    subject: "Your reimbursement was paid",
    lines: [
      `Your reimbursement request for "${row.description}" was paid.`,
      `The treasurer sent ${formatMoney(row.amount)} by Zelle to ${row.payment_method}.`,
    ],
  });
});
