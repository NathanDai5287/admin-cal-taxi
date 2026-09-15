/**
 * Server-side client for the order archive on minmus.
 *
 * The store is SQLite behind a small CRUD API in the same Flask app that
 * generates the PDFs, so the documents and the records of them live together.
 *
 * This module is server-only. Unlike `/api/host/generate/*`, orders are NOT
 * exposed through a next.config rewrite: writes are authenticated with a shared
 * secret, and a rewrite would proxy the browser straight through to the backend
 * without one. Server components call these directly; client components go
 * through the server actions in app/host/orders/actions.ts.
 */

import type { Order, OrderDocument, OrderStatus, OrderSummary } from "./host-orders-types";
import { revalidateTag } from "next/cache";

const ORIGIN = process.env.HOST_BACKEND_ORIGIN;
const KEY = process.env.HOST_BACKEND_KEY;

/** The archive could not be reached, or isn't configured at all. */
export class OrdersUnavailableError extends Error {}

/**
 * The archive answered with an error status.
 *
 * Carries `status` so callers can branch on it. Do not branch by matching the
 * message: the backend's error bodies are its own vocabulary (a missing order
 * is `{"error":"not_found"}`), so prose-matching silently stops working the
 * moment either side rewords anything.
 */
export class OrdersRequestError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`Order archive request failed: ${detail}`);
    this.status = status;
  }
}

/** True when the archive is wired up. Pages use this to explain themselves. */
export function ordersConfigured(): boolean {
  return Boolean(ORIGIN && KEY);
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  if (!ORIGIN || !KEY) {
    throw new OrdersUnavailableError(
      "Order archive is not configured — set HOST_BACKEND_ORIGIN and HOST_BACKEND_KEY.",
    );
  }

  let res: Response;
  try {
    const method = init?.method ?? "GET";
    res = await fetch(`${ORIGIN}/api/orders${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": KEY,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      ...(method === "GET"
        ? { next: { revalidate: 600, tags: ["host-orders"] } }
        : { cache: "no-store" as const }),
    });
  } catch (err) {
    // minmus down or unreachable — distinguish from a 4xx/5xx response.
    throw new OrdersUnavailableError(
      `Could not reach the order archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail || body.error || detail;
    } catch { /* non-JSON error body */ }
    throw new OrdersRequestError(res.status, detail);
  }

  const result = (await res.json()) as T;
  if ((init?.method ?? "GET") !== "GET") {
    revalidateTag("host-orders", { expire: 0 });
  }
  return result;
}

export async function listOrders(): Promise<OrderSummary[]> {
  const { orders } = await call<{ orders: OrderSummary[] }>("");
  return orders;
}

/** The order, or null when it doesn't exist — so pages can call `notFound()`. */
export async function getOrder(id: string): Promise<Order | null> {
  try {
    const { order } = await call<{ order: Order }>(`/${encodeURIComponent(id)}`);
    return order;
  } catch (err) {
    if (err instanceof OrdersRequestError && err.status === 404) return null;
    throw err;
  }
}

/** Fields a caller supplies when first saving an order. */
export type NewOrder = {
  clubName: string;
  eventDate: string;
  rentalPrice: number | null;
  depositAmount: number | null;
  notes?: string;
  snapshot: Record<string, unknown>;
  documents?: Omit<OrderDocument, "id">[];
};

export async function createOrder(input: NewOrder): Promise<Order> {
  const { order } = await call<{ order: Order }>("", { method: "POST", body: input });
  return order;
}

export type OrderPatch = Partial<{
  clubName: string;
  eventDate: string;
  rentalPrice: number | null;
  depositAmount: number | null;
  statusOverride: OrderStatus | null;
  notes: string;
  snapshot: Record<string, unknown>;
}>;

export async function updateOrder(id: string, patch: OrderPatch): Promise<Order> {
  const { order } = await call<{ order: Order }>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
  return order;
}

export async function deleteOrder(id: string): Promise<void> {
  await call<{ ok: true }>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Append a generated document. Returns the order with the document attached. */
export async function addDocument(
  id: string,
  doc: Omit<OrderDocument, "id">,
): Promise<Order> {
  const { order } = await call<{ order: Order }>(
    `/${encodeURIComponent(id)}/documents`,
    { method: "POST", body: doc },
  );
  return order;
}
