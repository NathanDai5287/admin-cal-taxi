import "server-only";

import { sendRecordedDuesEmail } from "./dues-email-history";
import { duesPaymentEmail } from "./dues-payment-email";
import type { PaymentPlanFrequency } from "./dues-payment-plan";
import { loadAllPages } from "./load-all-pages";
import { createAdminClient } from "./supabase/admin";

export async function duesPaymentIds(chargeId: string) {
  const db = createAdminClient();
  const { data, error } = await loadAllPages((from, to) => db.from("chapter_dues_payment_events")
    .select("id").eq("receivable_id", chargeId).order("id").range(from, to));
  if (error) throw new Error("The payment history could not be loaded.");
  return (data ?? []).map((payment) => payment.id);
}

export async function sendDuesPaymentConfirmation(chargeId: string, previousPaymentIds: string[]) {
  try {
    const db = createAdminClient();
    const [charge, history] = await Promise.all([
      db.from("chapter_receivables").select("id,member_id,member_name,amount_assessed,amount_paid,due_date,payment_plan_frequency,payment_plan_amount,payment_plan_interval_days,payment_plan_start_date").eq("id", chargeId).single(),
      loadAllPages((from, to) => db.from("chapter_dues_payment_events").select("id,amount,paid_date,date_is_estimated,created_at").eq("receivable_id", chargeId).order("created_at").order("id").range(from, to)),
    ]);
    if (charge.error || history.error) throw new Error("The confirmation details could not be loaded.");
    const previousIds = new Set(previousPaymentIds);
    const newPayments = history.data.filter((payment) => !previousIds.has(payment.id) && Number(payment.amount) > 0);
    if (!newPayments.length) return "";
    if (!charge.data.member_id) return "No confirmation email was sent: this charge has no linked member.";
    const member = await db.from("profiles").select("email").eq("id", charge.data.member_id).single();
    if (member.error) throw new Error("The member email could not be loaded.");
    if (!member.data.email?.trim()) return "No confirmation email was sent: the member has no email address.";
    const row = charge.data;
    for (const payment of newPayments) {
      const paymentsThroughReceipt = history.data.slice(0, history.data.findIndex((event) => event.id === payment.id) + 1);
      const body = duesPaymentEmail({
        memberName: row.member_name, chargeId: row.id, assessed: Number(row.amount_assessed), paid: paymentsThroughReceipt.reduce((sum, event) => sum + Math.round(Number(event.amount) * 100), 0) / 100, dueDate: row.due_date,
        payment: { amount: Number(payment.amount), paidDate: payment.paid_date },
        payments: paymentsThroughReceipt.slice().sort((a, b) => a.paid_date.localeCompare(b.paid_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          .map((payment) => ({ id: payment.id, amount: Number(payment.amount), paidDate: payment.paid_date, estimated: payment.date_is_estimated })),
        plan: row.payment_plan_frequency ? {
          frequency: row.payment_plan_frequency as PaymentPlanFrequency, amount: Number(row.payment_plan_amount),
          intervalDays: row.payment_plan_interval_days, startDate: row.payment_plan_start_date!,
        } : null,
      });
      const warning = await sendRecordedDuesEmail(chargeId, payment.id, { ...body, from: process.env.RESEND_FROM_EMAIL?.trim() || "Theta Xi <reimbursements@cal.taxi>", to: member.data.email });
      if (warning) return warning;
    }
    return "Confirmation email sent.";
  } catch {
    return "The payment is saved, but its confirmation email could not be sent. Contact the treasurer.";
  }
}
