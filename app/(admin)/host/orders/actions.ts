"use server";

/**
 * Server actions bridging the client pages to the order archive.
 *
 * Both the documents step (saving a new order) and the archive pages (status,
 * notes, deletion) come through here, so the shared secret in lib/host-orders.ts
 * stays on the server.
 *
 * Every action returns a result object rather than throwing: the archive lives
 * on a box that can be down, and a save failing must never lose the user's work
 * or blank the page. Callers surface `error` inline.
 */

import { revalidatePath } from "next/cache";
import {
  addDocument,
  createOrder,
  deleteOrder,
  getOrder,
  getOrderFresh,
  updateOrder,
  type NewOrder,
  type OrderPatch,
} from "@/lib/host-orders";
import type { Order, OrderDocument, OrderStatus } from "@/lib/host-orders-types";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { hostingPlanFromOrder } from "@/lib/finance/hosting";
import { z } from "zod";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function failed(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "request failed" };
}

/** Save the current workspace as a new order. */
export async function saveOrderAction(input: NewOrder): Promise<ActionResult<Order>> {
  // Layouts don't wrap server-action POSTs — every action must check the role.
  await requireAdmin("/");
  try {
    const order = await createOrder(input);
    revalidatePath("/host/orders");
    return { ok: true, data: order };
  } catch (err) {
    return failed(err);
  }
}

/** Attach a freshly generated document to an existing order. */
export async function addDocumentAction(
  orderId: string,
  doc: Omit<OrderDocument, "id">,
): Promise<ActionResult<Order>> {
  await requireAdmin("/");
  try {
    const order = await addDocument(orderId, doc);
    revalidatePath("/host/orders");
    revalidatePath(`/host/orders/${orderId}`);
    return { ok: true, data: order };
  } catch (err) {
    return failed(err);
  }
}

export async function updateOrderAction(
  orderId: string,
  patch: OrderPatch,
): Promise<ActionResult<Order>> {
  await requireAdmin("/");
  try {
    const order = await updateOrder(orderId, patch);
    revalidatePath("/host/orders");
    revalidatePath(`/host/orders/${orderId}`);
    return { ok: true, data: order };
  } catch (err) {
    return failed(err);
  }
}

export async function getOrderAction(orderId: string): Promise<ActionResult<Order>> {
  await requireAdmin("/");
  try {
    const order = await getOrderFresh(orderId);
    return order ? { ok: true, data: order } : failed(new Error("Order not found."));
  } catch (err) {
    return failed(err);
  }
}

export async function setOrderStatusAction(
  orderId: string,
  statusOverride: OrderStatus | null,
): Promise<ActionResult<Order>> {
  if (statusOverride === "cancelled") {
    return failed(new Error("Cancel the contract in Plan and payments."));
  }
  return updateOrderAction(orderId, { statusOverride });
}

export async function confirmHostingContractAction(orderId: string) {
  const { userId } = await requireAdmin("/");
  const id = z.string().min(1).max(200).safeParse(orderId);
  if (!id.success) return failed(new Error("Choose a valid hosting order."));

  try {
    const supabase = createAdminClient();
    const existing = await supabase.from("hosting_finance_orders").select("*").eq("order_id", id.data).maybeSingle();
    if (existing.error) return failed(existing.error);

    // Re-confirming a cancelled contract is a fresh confirmation decision:
    // the terms are re-copied from the order as it stands NOW, so a price
    // renegotiated while cancelled can't resurrect the old amounts. (The
    // database guard only allows term changes on this cancelled → confirmed
    // transition; re-confirming an already-confirmed order whose terms
    // changed is rejected there.)
    if (existing.data) {
      const order = await getOrder(id.data);
      if (!order) return failed(new Error("The hosting order was not found."));
      const plan = hostingPlanFromOrder(order);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.eventDate) || plan.plannedRevenue <= 0) {
        return failed(new Error("Add an event date and rental price before confirmation."));
      }
      const { data, error } = await supabase.from("hosting_finance_orders")
        .update({
          status: "confirmed",
          cancelled_at: null,
          organization: plan.organization,
          event_date: plan.eventDate,
          planned_revenue: plan.plannedRevenue,
          planned_fire_permit: plan.plannedFirePermit,
          confirmed_by: userId,
          confirmed_at: new Date().toISOString(),
        })
        .eq("order_id", id.data)
        .select("*")
        .single();
      if (error) return failed(error);
      revalidatePath("/finance/planning");
      revalidatePath(`/host/orders/${id.data}`);
      return { ok: true, data } as const;
    }

    const order = await getOrder(id.data);
    if (!order) return failed(new Error("The hosting order was not found."));
    const plan = hostingPlanFromOrder(order);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.eventDate) || plan.plannedRevenue <= 0) {
      return failed(new Error("Add an event date and rental price before confirmation."));
    }

    let { data, error } = await supabase.from("hosting_finance_orders").insert({
      order_id: plan.orderId,
      organization: plan.organization,
      event_date: plan.eventDate,
      planned_revenue: plan.plannedRevenue,
      planned_fire_permit: plan.plannedFirePermit,
      confirmed_by: userId,
    }).select("*").single();
    if (error?.code === "23505") {
      const current = await supabase.from("hosting_finance_orders").select("*").eq("order_id", id.data).single();
      data = current.data;
      error = current.error;
    }
    if (error) return failed(error);
    revalidatePath("/host/orders");
    revalidatePath(`/host/orders/${id.data}`);
    revalidatePath("/finance/planning");
    return { ok: true, data } as const;
  } catch (error) {
    return failed(error);
  }
}

export async function cancelHostingContractAction(orderId: string) {
  await requireAdmin("/");
  const id = z.string().min(1).max(200).safeParse(orderId);
  if (!id.success) return failed(new Error("Choose a valid hosting order."));
  const { data, error } = await createAdminClient().from("hosting_finance_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("order_id", id.data)
    .eq("status", "confirmed")
    .select("order_id")
    .maybeSingle();
  if (error) return failed(error);
  if (!data) return failed(new Error("Confirm this contract before cancelling it."));
  revalidatePath(`/host/orders/${id.data}`);
  revalidatePath("/finance/planning");
  return { ok: true, data: null } as const;
}

const hostingPaymentSchema = z.object({
  orderId: z.string().min(1).max(200),
  kind: z.enum(["revenue", "fire_permit"]),
  amount: z.number().positive().max(999_999_999.99),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestId: z.string().uuid(),
});

export async function recordHostingPaymentAction(input: z.infer<typeof hostingPaymentSchema>) {
  const { userId } = await requireAdmin("/");
  const parsed = hostingPaymentSchema.safeParse(input);
  if (!parsed.success) return failed(new Error("Enter a valid payment date and amount."));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_hosting_payment", {
    p_order_id: parsed.data.orderId,
    p_kind: parsed.data.kind,
    p_amount: parsed.data.amount,
    p_paid_date: parsed.data.paidDate,
    p_request_id: parsed.data.requestId,
  });
  if (error) return failed(error);
  revalidatePath(`/host/orders/${parsed.data.orderId}`);
  revalidatePath("/finance/planning");
  revalidatePath("/finance/reports");
  return { ok: true, data: { id: data, recordedBy: userId } } as const;
}

export async function reverseHostingPaymentAction(paymentId: string) {
  const { userId } = await requireAdmin("/");
  const id = z.string().uuid().safeParse(paymentId);
  if (!id.success) return failed(new Error("Choose a valid hosting payment."));

  const { data, error } = await createAdminClient().from("hosting_finance_payments")
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by: userId,
      reversal_reason: "Recorded in error",
    })
    .eq("id", id.data)
    .is("reversed_at", null)
    .select("order_id")
    .maybeSingle();
  if (error) return failed(error);
  if (!data) return failed(new Error("This payment was already reversed or no longer exists."));
  revalidatePath(`/host/orders/${data.order_id}`);
  revalidatePath("/finance/planning");
  revalidatePath("/finance/reports");
  return { ok: true, data: null } as const;
}

export async function setOrderNotesAction(
  orderId: string,
  notes: string,
): Promise<ActionResult<Order>> {
  return updateOrderAction(orderId, { notes });
}

export async function deleteOrderAction(orderId: string): Promise<ActionResult<null>> {
  await requireAdmin("/");
  const finance = await createAdminClient().from("hosting_finance_orders")
    .select("order_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (finance.error) return failed(finance.error);
  if (finance.data) return failed(new Error("This order has finance history and cannot be deleted."));
  try {
    await deleteOrder(orderId);
    revalidatePath("/host/orders");
    return { ok: true, data: null };
  } catch (err) {
    return failed(err);
  }
}
