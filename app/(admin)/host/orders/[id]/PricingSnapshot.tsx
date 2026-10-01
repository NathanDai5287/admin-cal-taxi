/**
 * Read-only rendering of `order.snapshot.pricingBreakdown` — the calculator
 * output at the moment this order was saved.
 *
 * `snapshot` is `Record<string, unknown>`; an older order may predate a field
 * added since (or, less likely, carry one from a future schema). Every value
 * is read individually and defensively — missing numbers are simply omitted
 * rather than rendered as "$0" or crashing the page.
 */

import { buildLineItems } from "../../documents/build-line-items";
import { savedPricing } from "@/lib/host-saved-pricing";
import { fmtUSD } from "../order-format";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export default function PricingSnapshot({ snapshot, rentalPrice, depositAmount }: {
  snapshot: Record<string, unknown>; rentalPrice: number | null; depositAmount: number | null;
}) {
  const raw = snapshot.pricingBreakdown;
  const b = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const historical = savedPricing(raw);
  const items = historical && rentalPrice !== null ? buildLineItems(historical, rentalPrice, "") : [];
  return <section className="card">
    <div className="card-header"><span className="card-title">Pricing Snapshot</span><span className="card-subtitle">Agreed pricing for this order.</span></div>
    <div className="card-body">
      {items.map((item, index) => <div key={index} className="flex items-baseline justify-between gap-4 text-[13px] py-2 border-b border-rule/60">
        <span>{item.description.replaceAll(" — ", ": ")}</span><span className="tabular-nums shrink-0">{fmtUSD(Number(item.amount))}</span>
      </div>)}
      <div className="flex justify-between gap-4 text-[15px] py-3 font-bold text-brand"><span>Agreed rental fee</span><span className="tabular-nums">{rentalPrice === null ? "Not set" : fmtUSD(rentalPrice)}</span></div>
      <div className="flex justify-between gap-4 text-[13px] py-2"><span>Refundable security deposit</span><span className="tabular-nums">{depositAmount === null ? "Not set" : fmtUSD(depositAmount)}</span></div>
      {b && num(b.total) !== null && <p className="text-[12px] text-muted pt-3 border-t border-rule">Original calculator estimate: {fmtUSD(num(b.total)!)}. The agreed fee above includes any negotiated adjustment.</p>}
    </div>
  </section>;
}
