import { escapeEmail } from "../host-email-template";
import { paymentPlanDueDate, paymentPlanFrequencyLabel, type DuesPaymentPlan } from "./dues-payment-plan";
import { formatMoney, formatReimbursementDate } from "./format";

export type DuesReceipt = {
  memberName: string;
  chargeId: string;
  assessed: number;
  paid: number;
  dueDate: string;
  plan: (DuesPaymentPlan & { startDate: string }) | null;
  payments: { id: string; amount: number; paidDate: string; estimated: boolean }[];
  payment: { amount: number; paidDate: string };
};

export function duesInstallments(receipt: DuesReceipt) {
  const assessed = Math.round(receipt.assessed * 100);
  const paid = Math.round(receipt.paid * 100);
  const amount = receipt.plan ? Math.round(receipt.plan.amount * 100) : assessed;
  return Array.from({ length: Math.ceil(assessed / amount) }, (_, index) => {
    const installment = Math.min(amount, assessed - index * amount);
    const covered = Math.min(Math.max(paid - index * amount, 0), installment);
    const dueDate = receipt.plan
      ? paymentPlanDueDate(receipt.plan.startDate, receipt.plan, index * amount / 100, receipt.assessed)
      : receipt.dueDate;
    if (!dueDate) throw new Error("The payment plan contains an unsupported due date.");
    return {
      dueDate, amount: installment / 100, remaining: (installment - covered) / 100,
      status: covered === installment ? "Paid" : covered > 0 ? "Part paid" : "Due",
    };
  });
}

function tableHead(labels: string[]) {
  return `<tr>${labels.map((label, index) => `<th scope="col" style="padding:10px 0;border-bottom:1px solid #c9d8e1;color:#466174;font-size:12px;font-weight:600;text-align:${index ? "right" : "left"}">${label}</th>`).join("")}</tr>`;
}

function cell(value: string, right = false) {
  return `<td style="padding:13px 0;border-bottom:1px solid #e3eaf0;text-align:${right ? "right" : "left"};vertical-align:top">${value}</td>`;
}

export function duesPaymentEmail(receipt: DuesReceipt) {
  const installments = duesInstallments(receipt);
  const next = installments.find((installment) => installment.remaining > 0);
  const remaining = (Math.round(receipt.assessed * 100) - Math.round(receipt.paid * 100)) / 100;
  const date = formatReimbursementDate;
  const money = formatMoney;
  const plan = receipt.plan ? `${money(receipt.plan.amount)} ${paymentPlanFrequencyLabel(receipt.plan)}` : "Single payment";
  const nextLine = next
    ? `Next payment: ${money(next.remaining)} due ${date(next.dueDate)}.`
    : "This charge is fully paid. No further payment is due.";
  const paymentRows = receipt.payments.map((payment) => `<tr>${cell(`${date(payment.paidDate)}${payment.estimated ? '<br><span style="font-size:11px;color:#466174">Estimated date</span>' : ""}`)}${cell(payment.amount < 0 ? "Adjustment" : "Payment", true)}${cell(money(payment.amount), true)}</tr>`).join("");
  const scheduleRows = installments.map((installment) => `<tr>${cell(date(installment.dueDate))}${cell(`${money(installment.amount)}${installment.status === "Part paid" ? `<br><span style="font-size:11px;color:#466174">${money(installment.remaining)} left</span>` : ""}`, true)}${cell(`<span style="color:${installment.status === "Paid" ? "#226247" : "#075985"};font-weight:600">${installment.status}</span>`, true)}</tr>`).join("");
  const subject = `Dues payment recorded: ${money(receipt.payment.amount)} · Theta Xi`;
  const text = [
    "Theta Xi · Nu Chapter · UC Berkeley", "Payment recorded", `Hello ${receipt.memberName},`,
    `We recorded your ${money(receipt.payment.amount)} dues payment dated ${date(receipt.payment.paidDate)}. Thank you.`,
    `Charge reference: ${receipt.chargeId}`, `Total charge: ${money(receipt.assessed)}`,
    `Total paid: ${money(receipt.paid)}`, `Remaining balance: ${money(remaining)}`, nextLine,
    "Recorded payments", ...receipt.payments.map((payment) => `${date(payment.paidDate)}${payment.estimated ? " (estimated date)" : ""} · ${payment.amount < 0 ? "Adjustment" : "Payment"} · ${money(payment.amount)}`),
    `Your payment plan: ${plan}`, "Schedule for this charge; recorded payments cover the earliest installments first.",
    ...installments.map((installment) => `${date(installment.dueDate)} · ${money(installment.amount)} · ${installment.status}${installment.status === "Part paid" ? ` · ${money(installment.remaining)} left` : ""}`),
    "This confirmation covers this charge only. Contact the chapter treasurer if any detail is incorrect.",
    "Theta Xi · Nu Chapter · UC Berkeley · cal.taxi",
  ].join("\n\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment recorded</title></head>
<body style="margin:0;background:#edf2f6;color:#172e40;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
<div style="display:none;max-height:0;overflow:hidden">${escapeEmail(`${money(receipt.payment.amount)} recorded. ${money(receipt.paid)} paid so far. ${money(remaining)} remaining.`)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff">
<tr><td style="background:#075985;color:#ffffff;padding:24px 28px"><strong style="font-size:21px;letter-spacing:0.02em">Theta Xi</strong><br><span style="font-size:12px;color:#d8edf8">Nu Chapter · UC Berkeley</span></td></tr>
<tr><td style="padding:30px 28px 20px"><h1 style="margin:0 0 16px;font-size:30px;line-height:1.2;letter-spacing:-0.02em">Payment recorded.</h1>
<p style="margin:0 0 12px">Hello ${escapeEmail(receipt.memberName)},</p><p style="margin:0">We recorded your <strong>${money(receipt.payment.amount)}</strong> dues payment dated <strong>${date(receipt.payment.paidDate)}</strong>. Thank you.</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8f2f9"><tr><td style="padding:18px 20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding-bottom:6px;color:#466174">Total charge</td><td align="right">${money(receipt.assessed)}</td></tr><tr><td style="padding-bottom:12px;color:#466174">Total paid</td><td align="right" style="padding-bottom:12px">${money(receipt.paid)}</td></tr><tr><td style="padding-top:12px;border-top:1px solid #bfd5e3;font-weight:bold">Remaining balance</td><td align="right" style="padding-top:12px;border-top:1px solid #bfd5e3;font-size:24px;font-weight:bold;color:#075985">${money(remaining)}</td></tr></table>
<p style="margin:16px 0 0;color:#075985;font-size:13px;font-weight:600">${escapeEmail(nextLine)}</p></td></tr></table></td></tr>
<tr><td style="padding:28px 28px 0"><h2 style="margin:0 0 8px;font-size:19px">Recorded payments</h2><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px"><thead>${tableHead(["Payment date", "Type", "Amount"])}</thead><tbody>${paymentRows}</tbody></table></td></tr>
<tr><td style="padding:28px"><h2 style="margin:0 0 6px;font-size:19px">Your payment plan</h2><p style="margin:0 0 6px;font-weight:bold;color:#075985">${escapeEmail(plan)}</p><p style="margin:0 0 8px;font-size:12px;color:#466174">Recorded payments cover the earliest installments first.</p><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px"><thead>${tableHead(["Due date", "Amount", "Status"])}</thead><tbody>${scheduleRows}</tbody></table>
<p style="margin:20px 0 0;font-size:12px;color:#466174">This confirmation covers this charge only. Contact the chapter treasurer if any detail is incorrect.</p><p style="margin:10px 0 0;font-size:11px;color:#466174;overflow-wrap:anywhere">Charge reference: ${escapeEmail(receipt.chargeId)}</p></td></tr>
<tr><td style="padding:20px 28px;background:#f4f7f9;color:#466174;font-size:12px"><strong style="color:#172e40">Theta Xi · Nu Chapter</strong><br>UC Berkeley · <a href="https://cal.taxi" style="color:#075985">cal.taxi</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
