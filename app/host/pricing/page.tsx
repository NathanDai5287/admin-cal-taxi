"use client";

import PricingCalculator from "@/components/host/PricingCalculator";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import { effective, hasDiverged } from "@/lib/host-derive";
import { useSharedData } from "@/lib/host-shared-state";

const fmtUSD = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function PricingPage() {
  const { hydrated, data, setDerived, resetDerived } = useSharedData();

  // The negotiated price tracks the calculator until the user types over it —
  // it is never seeded into storage, so changing a tier always moves it.
  const shown      = hydrated ? effective(data, "finalPrice") : "";
  const calcTotal  = data.pricingBreakdown?.total ?? null;
  const finalNum   = parseFloat(shown) || 0;
  const isManual   = data.overrides.finalPrice;
  const overridden = hasDiverged(data, "finalPrice");

  return (
    <div className="space-y-10">
      <div>
        <StepIndicator current="pricing" />
        <h1 className="page-title mt-6">Pricing</h1>
        <p className="page-lede">
          Pick the tier for each cost factor. The breakdown updates live. After you&rsquo;ve
          settled on a number, the negotiated total below feeds the contract and the rental
          invoice.
        </p>
      </div>

      <PricingCalculator />

      {/* ── Negotiated Price ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Negotiated Price</span>
          <span className="card-subtitle">Final number that will appear on the contract and invoices.</span>
        </div>
        <div className="card-body grid gap-6 sm:grid-cols-[260px_1fr] items-start">
          <div>
            <label className="field-label">Final Price (USD)</label>
            <input
              type="number"
              min={0}
              step={1}
              className="field-input"
              placeholder={calcTotal !== null ? String(Math.round(calcTotal)) : "e.g. 1500"}
              value={shown}
              onChange={e => setDerived("finalPrice", e.target.value)}
            />
            {calcTotal !== null && (
              <button
                type="button"
                onClick={() => resetDerived("finalPrice")}
                className="btn-link mt-2"
                disabled={!isManual}
              >
                Reset to calculated ({fmtUSD(Math.round(calcTotal))})
              </button>
            )}
          </div>

          <div className="text-[13px] text-muted leading-relaxed">
            {calcTotal === null ? (
              <p>The calculator hasn&rsquo;t produced a total yet — set guests above first.</p>
            ) : overridden ? (
              <p>
                You&rsquo;ve overridden the calculator. The contract&rsquo;s rental fee and the
                rental invoice&rsquo;s line items will scale to <strong className="text-ink">{fmtUSD(finalNum)}</strong>.
              </p>
            ) : isManual ? (
              <p>
                Set manually, and currently equal to the calculator. Reset it above to go back
                to tracking the calculator automatically.
              </p>
            ) : (
              <p>
                Tracking the calculator — this updates as you change the tiers above. Type a
                number to override it if you negotiate a different price; line items on the
                rental invoice will scale proportionally.
              </p>
            )}
            {data.pricingBreakdown
              && typeof data.pricingBreakdown.suggestedDeposit === "number"
              && typeof data.pricingBreakdown.depositRate === "number" && (
              <p className="mt-3 text-[12px]">
                Suggested security deposit:&nbsp;
                <strong className="text-ink">{fmtUSD(data.pricingBreakdown.suggestedDeposit)}</strong>
                <span className="text-muted">
                  {" "}({Math.round(data.pricingBreakdown.depositRate * 100)}% of total)
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      <StepNav current="pricing" />
    </div>
  );
}
