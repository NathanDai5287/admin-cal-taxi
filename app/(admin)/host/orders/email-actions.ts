"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { prepareHostingEmail, deliverHostingEmails, sendCompletedContract } from "@/lib/host-email";
import { currentRevision, contractWasSent, eventToday } from "@/lib/host-event";
import { listSigning, syncSigning } from "@/lib/host-signing";
import { getOrderFresh } from "@/lib/host-orders";
import { ensureHostingForecast, loadWorkflow, workflowDb } from "@/lib/host-workflow";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { orderPaymentSchedule } from "@/lib/host-payment-schedule";

const requestSchema = z.object({ orderId: z.string().min(1).max(200), revisionId: z.string().startsWith("sig_").max(200), expectedUpdatedAt: z.string().max(100), kind: z.enum(["invitation", "reminder", "completed", "deposit_invoice", "rental_invoice", "deposit_receipt", "receipt", "refund"]), recipients: z.array(z.string().email()).max(40).optional(), refund: z.object({ amount: z.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.string().trim().max(120) }).optional() });
function failure(error: unknown) { return { ok: false as const, error: error instanceof Error ? error.message : "Request failed. Please retry." }; }
function refresh(orderId: string) { revalidatePath(`/host/orders/${orderId}`); revalidatePath("/host/orders"); revalidatePath("/finance/planning"); }
export async function recordHostingDepositReturnAction(orderId: string) {
  await requireAppAccess("host", "write");
  try {
    z.string().min(1).max(200).parse(orderId);
    const [order, workflow] = await Promise.all([getOrderFresh(orderId), loadWorkflow(orderId)]);
    if (!order || order.statusOverride === "cancelled" || workflow.cancelledAt) throw new Error("This order cannot return a deposit.");
    if (workflow.refund) return { ok: true as const, data: workflow.refund };
    const date = eventToday();
    if (order.snapshot.rentalPaymentTiming === "day_before" && date < orderPaymentSchedule(order).eventEndDate) throw new Error("Return the deposit after the event ends.");
    const db = workflowDb();
    const [deposits, rentals] = await Promise.all([
      db.from("hosting_deposit_payments").select("amount").eq("order_id", orderId).is("reversed_at", null),
      createAdminClient().from("hosting_finance_payments").select("amount").eq("order_id", orderId).eq("kind", "revenue").is("reversed_at", null),
    ]);
    if (deposits.error || rentals.error) throw new Error("Unable to verify recorded payments.");
    const amount = (deposits.data ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
    const rentalPaid = (rentals.data ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
    if (amount <= 0) throw new Error("Record the received deposit before marking it returned.");
    if (rentalPaid < (order.rentalPrice ?? Infinity)) throw new Error("Record the full rental payment before returning the deposit.");
    const state = await db.from("hosting_event_state").upsert({ order_id: orderId }, { onConflict: "order_id", ignoreDuplicates: true });
    if (state.error) throw new Error("Unable to save the deposit return.");
    const saved = await db.from("hosting_event_state").update({ refund_amount: amount, refund_date: date, refund_method: null }).eq("order_id", orderId).is("refund_amount", null).is("cancelled_at", null);
    if (saved.error) throw new Error("Unable to save the deposit return.");
    const current = await loadWorkflow(orderId);
    if (!current.refund || current.cancelledAt) throw new Error("The order changed. Reload before recording the deposit return.");
    refresh(orderId);
    return { ok: true as const, data: current.refund };
  } catch (error) { return failure(error); }
}
export async function recordHostingDepositAction(input: { orderId: string; amount: number; paidDate: string; requestId: string }) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: z.string().min(1).max(200), amount: z.number().positive(), paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), requestId: z.string().uuid() }).parse(input);
    if (parsed.paidDate > eventToday()) throw new Error("Choose today or an earlier payment date.");
    const order = await getOrderFresh(parsed.orderId);
    if (!order || order.statusOverride === "cancelled") throw new Error("This order cannot receive a deposit.");
    const { data, error } = await workflowDb().rpc("record_hosting_deposit", { p_order_id: order.id, p_amount: parsed.amount, p_limit: order.depositAmount, p_paid_date: parsed.paidDate, p_request_id: parsed.requestId, p_user_id: userId });
    if (error) throw new Error(error.message);
    refresh(order.id);
    return { ok: true as const, data: { id: data as string } };
  } catch (error) { return failure(error); }
}
export async function undoHostingDepositAction(input: { orderId: string; paymentIds: string[] }) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: z.string().min(1).max(200), paymentIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input);
    const { error } = await workflowDb().from("hosting_deposit_payments").update({ reversed_at: new Date().toISOString(), reversed_by: userId, reversal_reason: "Paid status undone" }).eq("order_id", parsed.orderId).in("id", parsed.paymentIds).is("reversed_at", null);
    if (error) throw new Error(error.message);
    refresh(parsed.orderId);
    return { ok: true as const, data: null };
  } catch (error) { return failure(error); }
}
export async function previewHostingEmailAction(input: z.infer<typeof requestSchema>) {
  await requireAppAccess("host", "write");
  try { return { ok: true as const, data: await prepareHostingEmail(requestSchema.parse(input)) }; } catch (error) { return failure(error); }
}
export async function sendHostingEmailAction(orderId: string, ids: string[]) {
  await requireAppAccess("host", "write");
  try {
    z.string().min(1).max(200).parse(orderId); z.array(z.string().uuid()).min(1).max(40).parse(ids);
    const data = await deliverHostingEmails(orderId, ids); refresh(orderId); return { ok: true as const, data };
  } catch (error) { return failure(error); }
}
export async function refreshHostingProgressAction(orderId: string) {
  await requireAppAccess("host", "write");
  try {
    z.string().min(1).max(200).parse(orderId);
    const revision = currentRevision(await listSigning(orderId));
    if (revision?.envelope_id) await syncSigning(orderId, revision.id);
    const latest = currentRevision(await listSigning(orderId));
    const workflow = await loadWorkflow(orderId);
    const order = await getOrderFresh(orderId);
    if (order && !workflow.cancelledAt && order.statusOverride !== "cancelled" && contractWasSent(latest, workflow)) await ensureHostingForecast(order);
    if (latest?.state === "signed") await sendCompletedContract(orderId, latest.id);
    refresh(orderId); return { ok: true as const };
  } catch (error) { refresh(orderId); return failure(error); }
}
export async function copyHostingSigningLinkAction(orderId: string, revisionId: string, email: string) {
  await requireAppAccess("host", "write");
  try {
    z.string().min(1).max(200).parse(orderId); z.string().max(200).parse(revisionId); z.string().email().parse(email);
    const revision = currentRevision(await listSigning(orderId));
    const workflow = await loadWorkflow(orderId);
    if (workflow.cancelledAt || revision?.id !== revisionId || revision.state !== "awaiting_signatures") throw new Error("This signing link is no longer current. Reload the order.");
    const person = revision.recipients.find(p => p.email === email);
    if (!person || person.status === "SIGNED" || !person.link) throw new Error("This person no longer needs a signing link.");
    return { ok: true as const, data: person.link };
  } catch (error) { return failure(error); }
}
export async function cancelHostingEventAction(orderId: string) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    z.string().min(1).max(200).parse(orderId);
    if (!await getOrderFresh(orderId)) throw new Error("Order not found.");
    const result = await workflowDb().rpc("cancel_hosting_event", { p_order_id: orderId, p_user_id: userId });
    if (result.error) throw new Error("Unable to cancel the event.");
    refresh(orderId); return { ok: true as const };
  } catch (error) { return failure(error); }
}
