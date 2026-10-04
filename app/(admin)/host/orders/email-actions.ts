"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { prepareHostingEmail, deliverHostingEmails, sendCompletedContract } from "@/lib/host-email";
import { currentRevision, contractWasSent } from "@/lib/host-event";
import { listSigning, syncSigning } from "@/lib/host-signing";
import { getOrderFresh } from "@/lib/host-orders";
import { ensureHostingForecast, loadWorkflow, workflowDb } from "@/lib/host-workflow";

const requestSchema = z.object({ orderId: z.string().min(1).max(200), revisionId: z.string().startsWith("sig_").max(200), expectedUpdatedAt: z.string().max(100), kind: z.enum(["invitation", "reminder", "completed", "deposit_invoice", "rental_invoice", "receipt", "refund"]), recipients: z.array(z.string().email()).max(40).optional(), refund: z.object({ amount: z.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.string().trim().min(1).max(120) }).optional() });
function failure(error: unknown) { return { ok: false as const, error: error instanceof Error ? error.message : "Request failed. Please retry." }; }
function refresh(orderId: string) { revalidatePath(`/host/orders/${orderId}`); revalidatePath("/host/orders"); revalidatePath("/finance/planning"); }
export async function previewHostingEmailAction(input: z.infer<typeof requestSchema>) {
  await requireAdmin("/");
  try { return { ok: true as const, data: await prepareHostingEmail(requestSchema.parse(input)) }; } catch (error) { return failure(error); }
}
export async function sendHostingEmailAction(orderId: string, ids: string[]) {
  await requireAdmin("/");
  try {
    z.string().min(1).max(200).parse(orderId); z.array(z.string().uuid()).min(1).max(40).parse(ids);
    const data = await deliverHostingEmails(orderId, ids); refresh(orderId); return { ok: true as const, data };
  } catch (error) { return failure(error); }
}
export async function refreshHostingProgressAction(orderId: string) {
  await requireAdmin("/");
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
  await requireAdmin("/");
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
  const { userId } = await requireAdmin("/");
  try {
    z.string().min(1).max(200).parse(orderId);
    if (!await getOrderFresh(orderId)) throw new Error("Order not found.");
    const result = await workflowDb().rpc("cancel_hosting_event", { p_order_id: orderId, p_user_id: userId });
    if (result.error) throw new Error("Unable to cancel the event.");
    refresh(orderId); return { ok: true as const };
  } catch (error) { return failure(error); }
}
