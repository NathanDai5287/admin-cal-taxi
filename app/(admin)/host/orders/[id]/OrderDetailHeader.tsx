import { ButtonLink } from "@/components/brand/button";
import { formatDateISO } from "@/lib/host-format";
import type { Order, OrderStatus, OrderSummary } from "@/lib/host-orders-types";
import type { ReactNode } from "react";

export default function OrderDetailHeader({
  order,
  actions,
}: {
  order: Order | OrderSummary;
  status: OrderStatus;
  actions: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <ButtonLink href="/host/orders" variant="text">← Back to Orders</ButtonLink>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="page-title">{order.clubName || "Event order"}</h1>
          <p className="text-[13.5px] text-muted mt-2">
            {formatDateISO(order.eventDate) || "Date to be determined"}
          </p>
          <p className="text-[11.5px] text-muted mt-3">
            Created {formatDateISO(order.createdAt.slice(0, 10))} · Updated{" "}
            {formatDateISO(order.updatedAt.slice(0, 10))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-rule">
        {actions}
      </div>
    </div>
  );
}
