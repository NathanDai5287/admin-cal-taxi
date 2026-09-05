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
  updateOrder,
  type NewOrder,
  type OrderPatch,
} from "@/lib/host-orders";
import type { Order, OrderDocument, OrderStatus } from "@/lib/host-orders-types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function failed(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "request failed" };
}

/** Save the current workspace as a new order. */
export async function saveOrderAction(input: NewOrder): Promise<ActionResult<Order>> {
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
  try {
    const order = await updateOrder(orderId, patch);
    revalidatePath("/host/orders");
    revalidatePath(`/host/orders/${orderId}`);
    return { ok: true, data: order };
  } catch (err) {
    return failed(err);
  }
}

export async function setOrderStatusAction(
  orderId: string,
  statusOverride: OrderStatus | null,
): Promise<ActionResult<Order>> {
  return updateOrderAction(orderId, { statusOverride });
}

export async function setOrderNotesAction(
  orderId: string,
  notes: string,
): Promise<ActionResult<Order>> {
  return updateOrderAction(orderId, { notes });
}

export async function deleteOrderAction(orderId: string): Promise<ActionResult<null>> {
  try {
    await deleteOrder(orderId);
    revalidatePath("/host/orders");
    return { ok: true, data: null };
  } catch (err) {
    return failed(err);
  }
}
