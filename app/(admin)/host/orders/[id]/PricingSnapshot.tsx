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
  const largest = Math.max(0, ...items.map(item => Number(item.amount)));
  return <section className="min-w-0">
    <h2 className="text-lg font-semibold">Pricing</h2>
    <dl className="mt-3 grid grid-cols-2 gap-4 bg-brand-light px-4 py-3">
      <div><dt className="text-[12px] text-brand">Agreed rental fee</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-brand">{rentalPrice === null ? "Not set" : fmtUSD(rentalPrice)}</dd></div>
      <div><dt className="text-[12px] text-brand">Refundable deposit</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-brand">{depositAmount === null ? "Not set" : fmtUSD(depositAmount)}</dd></div>
    </dl>
    <div className="mt-3">
      <dl className="space-y-2.5">{items.map((item, index) => {
        const [label, ...details] = item.description.split(" — ");
        const permit = label.startsWith("Fire permit (");
        return <div key={index} className="grid grid-cols-[minmax(0,1fr)_3rem_5rem] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_4rem_5rem]">
          <dt className="min-w-0"><span className="font-medium">{permit ? "Fire permit" : label}</span>{(details.length > 0 || permit) && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{permit ? label.slice("Fire permit (".length, -1) : details.join(" — ")}</span>}</dt>
          <dd className="contents"><span aria-hidden="true" className="h-1.5 bg-brand/10"><span className="block h-full bg-brand/60" style={{ width: `${largest > 0 ? Math.max(0, Number(item.amount)) / largest * 100 : 0}%` }} /></span><span className="text-right font-medium tabular-nums">{fmtUSD(Number(item.amount))}</span></dd>
        </div>;
      })}</dl>
      {b && num(b.total) !== null && <p className="text-[12px] text-muted mt-2">Original estimate: {fmtUSD(num(b.total)!)}</p>}
    </div>
  </section>;
}
