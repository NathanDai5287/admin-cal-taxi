/**
 * The lifecycle pill shown on both the order list and the order detail
 * header. No interactivity, so it carries no "use client" directive and can
 * be imported from either a server component (the detail page) or a client
 * one (OrdersList) without pulling extra weight into either bundle.
 */

import { STATUS_LABELS, type OrderStatus } from "@/lib/host-orders-types";

const STYLES: Record<OrderStatus, string> = {
  draft:      "bg-canvas text-muted border-rule",
  contracted: "bg-brand-light text-brand border-brand/30",
  invoiced:   "bg-warn-light text-warn border-warn/30",
  completed:  "bg-ok-light text-ok border-ok/30",
  cancelled:  "bg-canvas text-muted border-rule",
};

export default function StatusPill({
  status,
  large = false,
}: {
  status: OrderStatus;
  large?: boolean;
}) {
  return (
    <span
      className={
        "inline-block border font-bold uppercase whitespace-nowrap " +
        (large
          ? "px-3 py-1 text-[12px] tracking-[0.12em]"
          : "px-2 py-0.5 text-[10.5px] tracking-[0.10em]") +
        " " +
        STYLES[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
