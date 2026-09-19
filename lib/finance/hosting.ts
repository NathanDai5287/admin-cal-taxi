import type { Order } from "@/lib/host-orders-types";

function finiteAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function hostingPlanFromOrder(order: Order) {
  const pricing = order.snapshot.pricingBreakdown;
  const firePermit = pricing && typeof pricing === "object"
    ? finiteAmount((pricing as Record<string, unknown>).firePermit)
    : 0;

  return {
    orderId: order.id,
    organization: order.clubName || "Unnamed organization",
    eventDate: order.eventDate,
    plannedRevenue: finiteAmount(order.rentalPrice),
    plannedFirePermit: firePermit,
  };
}
