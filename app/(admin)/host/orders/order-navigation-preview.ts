import type { OrderSummary } from "@/lib/host-orders-types";

let currentPreview: OrderSummary | null = null;
const listeners = new Set<() => void>();
let expirationTimer: ReturnType<typeof setTimeout> | null = null;

export function setOrderNavigationPreview(order: OrderSummary) {
  currentPreview = order;
  if (expirationTimer) clearTimeout(expirationTimer);
  expirationTimer = setTimeout(() => {
    currentPreview = null;
    listeners.forEach(listener => listener());
    expirationTimer = null;
  }, 4 * 60_000);
  listeners.forEach(listener => listener());
}

export function subscribeToOrderNavigationPreview(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOrderNavigationPreview() {
  return currentPreview;
}

export function getServerOrderNavigationPreview() {
  return null;
}
