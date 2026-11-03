import "server-only";

import { eventToday } from "./host-event";
import { getOrderFresh } from "./host-orders";
import { orderPaymentSchedule } from "./host-payment-schedule";
import { loadDepositSettlement } from "./host-settlement";
import { loadWorkflow, workflowDb } from "./host-workflow";
import { createAdminClient } from "./reimbursements/supabase/admin";

export async function recordHostingDepositReturn(orderId: string) {
  const [order, workflow, settlement] = await Promise.all([getOrderFresh(orderId), loadWorkflow(orderId), loadDepositSettlement(orderId)]);
  if (!order || order.statusOverride === "cancelled" || workflow.cancelledAt) throw new Error("This order cannot return a deposit.");
  if (workflow.refund) return workflow.refund;
  const date = eventToday();
  if (order.snapshot.rentalPaymentTiming === "day_before" && date < orderPaymentSchedule(order).eventEndDate) throw new Error("Return the deposit after the event ends.");
  const db = workflowDb();
  const [deposits, rentals] = await Promise.all([
    db.from("hosting_deposit_payments").select("amount").eq("order_id", orderId).is("reversed_at", null),
    createAdminClient().from("hosting_finance_payments").select("amount").eq("order_id", orderId).eq("kind", "revenue").is("reversed_at", null),
  ]);
  if (deposits.error || rentals.error) throw new Error("Unable to verify recorded payments.");
  const depositPaid = (deposits.data ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
  const rentalPaid = (rentals.data ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
  if (depositPaid <= 0) throw new Error("Record the received deposit before marking it returned.");
  if (rentalPaid < (order.rentalPrice ?? Infinity)) throw new Error("Record the full rental payment before returning the deposit.");
  if (settlement && (settlement.status !== "sent" || !settlement.noticeSentAt)) throw new Error("Send the settlement notice before recording the return.");
  const deductions = settlement?.items.reduce((total, item) => total + item.amount, 0) ?? 0;
  const amount = Math.max((settlement?.depositAmount ?? depositPaid) - deductions, 0);
  const returnDate = date;
  const returnMethod = amount === 0 ? "No refund" : settlement?.refundMethod.trim() || "Zelle";
  const state = await db.from("hosting_event_state").upsert({ order_id: orderId }, { onConflict: "order_id", ignoreDuplicates: true });
  if (state.error) throw new Error("Unable to save the deposit return.");
  const saved = await db.from("hosting_event_state").update({ refund_amount: amount, refund_date: returnDate, refund_method: returnMethod }).eq("order_id", orderId).is("refund_amount", null).is("cancelled_at", null);
  if (saved.error) throw new Error("Unable to save the deposit return.");
  if (settlement) {
    const settled = await db.from("hosting_damage_settlements").update({ status: "returned", returned_at: new Date().toISOString() }).eq("id", settlement.id).eq("status", "sent");
    if (settled.error) throw new Error("The return was recorded, but the settlement could not be completed. Reload before retrying.");
  }
  const current = await loadWorkflow(orderId);
  if (!current.refund || current.cancelledAt) throw new Error("The order changed. Reload before recording the deposit return.");
  return current.refund;
}
