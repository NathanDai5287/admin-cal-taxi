/**
 * Read-only rendering of `order.snapshot.pricingBreakdown` — the calculator
 * output at the moment this order was saved.
 *
 * `snapshot` is `Record<string, unknown>`; an older order may predate a field
 * added since (or, less likely, carry one from a future schema). Every value
 * is read individually and defensively — missing numbers are simply omitted
 * rather than rendered as "$0" or crashing the page.
 */

import { fmtUSD } from "../order-format";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

type Row = { label: string; amount: number | null; detail?: string };

export default function PricingSnapshot({ snapshot }: { snapshot: Record<string, unknown> }) {
  const raw = snapshot.pricingBreakdown;

  if (!raw || typeof raw !== "object") {
    return (
      <section className="card">
        <div className="card-header"><span className="card-title">Pricing Snapshot</span></div>
        <div className="card-body">
          <p className="text-[13px] text-muted">No pricing breakdown was saved with this order.</p>
        </div>
      </section>
    );
  }

  const b = raw as Record<string, unknown>;
  const guests = num(b.guests);

  const rows: Row[] = [
    { label: "Base rental",         amount: num(b.base) },
    {
      label: "Capacity",
      amount: num(b.capacity),
      detail: guests !== null ? `${guests} guest${guests === 1 ? "" : "s"}` : undefined,
    },
    { label: "Fire permit",         amount: num(b.firePermit) },
    { label: "Alcohol",             amount: num(b.alcohol),     detail: str(b.alcoholLabel) ?? undefined },
    { label: "Property protection", amount: num(b.protection),  detail: str(b.protectionLabel) ?? undefined },
    { label: "Date surcharge",      amount: num(b.date),        detail: str(b.dateLabel) ?? undefined },
    { label: "Setup",               amount: num(b.setup),       detail: str(b.setupLabel) ?? undefined },
    { label: "Cleanup",             amount: num(b.cleanup),     detail: str(b.cleanupLabel) ?? undefined },
  ].filter(r => r.amount !== null && r.amount > 0);

  const subtotal   = num(b.subtotal);
  const wealthMult = num(b.wealthMult);
  const wealthLabel = str(b.wealthLabel);
  const postW      = num(b.postW);
  const relR       = num(b.relR);
  const relLabel   = str(b.relLabel);
  const adj        = num(b.adj);
  const total      = num(b.total);

  const nothingToShow = rows.length === 0 && subtotal === null && total === null;

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Pricing Snapshot</span>
        <span className="card-subtitle">As calculated when this order was saved.</span>
      </div>
      <div className="card-body space-y-1">
        {nothingToShow && (
          <p className="text-[13px] text-muted">This snapshot has no readable pricing fields.</p>
        )}

        {rows.map(r => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 text-[13px] py-1.5 border-b border-rule/60 last:border-b-0"
          >
            <span className="text-ink">
              {r.label}
              {r.detail && <span className="text-muted"> — {r.detail}</span>}
            </span>
            <span className="tabular-nums text-ink shrink-0">{fmtUSD(r.amount ?? 0)}</span>
          </div>
        ))}

        {subtotal !== null && (
          <div className="flex items-baseline justify-between gap-4 text-[13px] py-1.5 pt-3 mt-1 border-t border-rule font-semibold">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmtUSD(subtotal)}</span>
          </div>
        )}

        {wealthMult !== null && (
          <div className="flex items-baseline justify-between gap-4 text-[12.5px] py-1 text-muted">
            <span>Wealth multiplier{wealthLabel ? ` — ${wealthLabel}` : ""}</span>
            <span className="tabular-nums">
              ×{wealthMult.toFixed(2)}
              {postW !== null ? ` → ${fmtUSD(postW)}` : ""}
            </span>
          </div>
        )}

        {(relR !== null || adj !== null) && (
          <div className="flex items-baseline justify-between gap-4 text-[12.5px] py-1 text-muted">
            <span>Relationship adjustment{relLabel ? ` — ${relLabel}` : ""}</span>
            <span className="tabular-nums">
              {relR !== null ? `${relR > 0 ? "+" : ""}${Math.round(relR * 100)}%` : ""}
              {adj !== null ? ` (${fmtUSD(adj)})` : ""}
            </span>
          </div>
        )}

        {total !== null && (
          <div className="flex items-baseline justify-between gap-4 text-[15px] py-2 mt-2 border-t border-rule font-bold text-brand">
            <span>Total</span>
            <span className="tabular-nums">{fmtUSD(total)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
