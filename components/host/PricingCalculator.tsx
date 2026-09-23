"use client";

import {
  AmountTier,
  MultiplierTier,
  PRICING_CONSTANTS,
  RelationshipTier,
} from "@/lib/host-pricing-constants";
import { computePricing } from "@/lib/host-pricing";
import { useSharedData, PricingSelections } from "@/lib/host-shared-state";
import { ButtonLink } from "@/components/brand/button";

const fmt = (n: number) =>
  "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

type AnyTier = AmountTier | MultiplierTier | RelationshipTier;

function RadioGroup<T extends AnyTier>({
  name,
  tiers,
  selected,
  onSelect,
  formatVal,
  valClassFn,
}: {
  name: string;
  tiers: T[];
  selected: number;
  onSelect: (i: number) => void;
  formatVal: (t: T) => string;
  valClassFn?: (t: T) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {tiers.map((tier, i) => {
        const isSelected = selected === i;
        const vc = valClassFn ? valClassFn(tier) : "";
        const isWarn = vc === "is-surcharge";
        return (
          <label
            key={i}
            className={
              "radio-option" +
              (isSelected ? (isWarn ? " selected-warn" : " selected") : "")
            }
            onClick={() => onSelect(i)}
          >
            <input type="radio" name={name} checked={isSelected} readOnly />
            <span className="font-semibold flex-1 text-[13.5px]">{tier.label}</span>
            <span
              className={
                "text-[12px] tabular-nums whitespace-nowrap " +
                (vc === "is-surcharge"
                  ? "text-warn font-bold"
                  : vc === "is-discount"
                  ? "text-ok font-semibold"
                  : "text-muted")
              }
            >
              {formatVal(tier)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function BreakdownRow({
  label, value, className = "", dim = false,
}: {
  label: string; value: string; className?: string; dim?: boolean;
}) {
  return (
    <div
      className={
        "flex justify-between items-baseline py-1 text-[12.5px] " +
        (dim ? "text-muted " : "text-ink ") +
        className
      }
    >
      <span className="flex-1 pr-2">{label}</span>
      <span className="tabular-nums font-medium min-w-[56px] text-right whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

export default function PricingCalculator() {
  const C = PRICING_CONSTANTS;
  const { hydrated, data, update } = useSharedData();

  // Guests is owned by the Event Details step — shown here read-only so the
  // calculator's most influential input can't drift from what was agreed
  // there. The breakdown is computed live from (guests, selections), so it
  // always matches this page's inputs; nothing is persisted.
  const guestsNum = Math.max(0, parseInt(data.numGuests) || 0);

  // Selection helpers — read from shared.pricingSelections.
  const sel = data.pricingSelections;
  const setSel = (k: keyof PricingSelections) => (i: number) =>
    update("pricingSelections", { ...sel, [k]: i });

  const cleanupIdx = Math.min(Math.max(sel.cleanup, 0), C.cleanupTiers.length - 1);
  const result = computePricing(guestsNum, sel);

  const fmtDollar = (t: AmountTier) => fmt(t.amount);
  const fmtMult   = (t: MultiplierTier) => "×" + t.multiplier.toFixed(2);
  const fmtRel    = (t: RelationshipTier) => {
    if (t.r === 0) return "0%";
    if (t.r < 0)   return `+${Math.round(Math.abs(t.r * 100))}% surcharge`;
    return `−${Math.round(t.r * 100)}% off`;
  };
  const relClass  = (t: RelationshipTier) =>
    t.r < 0 ? "is-surcharge" : t.r > 0 ? "is-discount" : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
      {/* ── Inputs ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">Event Configuration</span></div>
        <div className="card-body space-y-6">
          <div>
            <label className="field-label">Number of Guests</label>
            <div className="field-input bg-canvas flex items-center justify-between gap-3 max-w-[260px]">
              <span className="tabular-nums">
                {hydrated && data.numGuests ? data.numGuests : "—"}
              </span>
              <ButtonLink href="/host" variant="text">
                Change
              </ButtonLink>
            </div>
            <p className="field-hint">Set on the Event Details step.</p>
          </div>

          <hr className="border-rule" />

          <div>
            <label className="field-label">Alcohol</label>
            <RadioGroup name="alcohol" tiers={C.alcoholTiers} selected={sel.alcohol}
              onSelect={setSel("alcohol")} formatVal={fmtDollar} />
          </div>

          <div>
            <label className="field-label">Property Protection</label>
            <RadioGroup name="protection" tiers={C.protectionTiers} selected={sel.protection}
              onSelect={setSel("protection")} formatVal={fmtDollar} />
          </div>

          <div>
            <label className="field-label">Date / Scheduling</label>
            <RadioGroup name="date" tiers={C.dateTiers} selected={sel.date}
              onSelect={setSel("date")} formatVal={fmtDollar} />
          </div>

          <div>
            <label className="field-label">Setup</label>
            <RadioGroup name="setup" tiers={C.setupTiers} selected={sel.setup}
              onSelect={setSel("setup")} formatVal={fmtDollar} />
          </div>

          <div>
            <label className="field-label">Cleanup</label>
            <RadioGroup name="cleanup" tiers={C.cleanupTiers} selected={cleanupIdx}
              onSelect={setSel("cleanup")} formatVal={fmtDollar} />
          </div>

          <hr className="border-rule" />

          <div>
            <label className="field-label">Client Budget / Wealth</label>
            <RadioGroup name="wealth" tiers={C.wealthTiers} selected={sel.wealth}
              onSelect={setSel("wealth")} formatVal={fmtMult} />
          </div>

          <div>
            <label className="field-label">Relationship</label>
            <RadioGroup name="relationship" tiers={C.relationshipTiers} selected={sel.relationship}
              onSelect={setSel("relationship")} formatVal={fmtRel} valClassFn={relClass} />
          </div>
        </div>
      </div>

      {/* ── Result panel — sticky on desktop ── */}
      <aside className="card lg:sticky lg:top-6">
        <div className="card-header pb-2"><span className="card-title">Estimate</span></div>
        <div className="text-center px-6 pt-1 pb-5">
          <div className="text-[44px] font-extrabold text-brand tracking-[-0.04em] leading-none tabular-nums">
            {fmt(result.total)}
          </div>
          <div className="text-[11.5px] text-muted mt-2">
            Suggested deposit:{" "}
            <span className="text-ink font-medium">{fmt(result.suggestedDeposit)}</span>
            <span className="text-muted">
              {" "}({Math.round(result.depositRate * 100)}% — {result.relLabel.split(" — ")[0]})
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 border-t border-rule pt-3">
          <BreakdownRow label="Base rate" value={fmt(C.baseRate)} />
          <BreakdownRow
            label={`Capacity (${Math.max(0, guestsNum - C.capacityThreshold)} × $${C.perGuestRate.toFixed(2)})`}
            value={result.capacity > 0 ? `+${fmt(result.capacity)}` : "$0"}
            dim={result.capacity === 0}
          />
          <BreakdownRow
            label="Fire permit (Required for > 50 guests)"
            value={result.firePermit > 0 ? `+${fmt(result.firePermit)}` : "$0"}
            dim={result.firePermit === 0}
          />
          <BreakdownRow
            label={`Alcohol — ${result.alcoholLabel}`}
            value={result.alcohol > 0 ? `+${fmt(result.alcohol)}` : "$0"}
            dim={result.alcohol === 0}
          />
          <BreakdownRow
            label={`Protection — ${result.protectionLabel}`}
            value={result.protection > 0 ? `+${fmt(result.protection)}` : "$0"}
            dim={result.protection === 0}
          />
          <BreakdownRow
            label={`Date — ${result.dateLabel}`}
            value={result.date > 0 ? `+${fmt(result.date)}` : "$0"}
            dim={result.date === 0}
          />
          <BreakdownRow
            label={`Setup — ${result.setupLabel}`}
            value={result.setup > 0 ? `+${fmt(result.setup)}` : "$0"}
            dim={result.setup === 0}
          />
          <BreakdownRow
            label={`Cleanup — ${result.cleanupLabel}`}
            value={result.cleanup > 0 ? `+${fmt(result.cleanup)}` : "$0"}
            dim={result.cleanup === 0}
          />

          <hr className="my-2 border-rule" />

          <BreakdownRow label="Subtotal" value={fmt(result.subtotal)}
            className="font-bold !text-ink" />
          <BreakdownRow label={`Wealth ×${result.wealthMult.toFixed(2)}`}
            value={`→ ${fmt(result.postW)}`} />

          {result.relR < 0 && (
            <BreakdownRow
              label={`Relationship surcharge (${Math.round(Math.abs(result.relR * 100))}%)`}
              value={`+${fmt(Math.abs(result.adj))}`}
              className="!text-warn"
            />
          )}
          {result.relR > 0 && (
            <BreakdownRow
              label={`Relationship discount (${Math.round(result.relR * 100)}%)`}
              value={`−${fmt(result.adj)}`}
              className="!text-ok"
            />
          )}

          <hr className="my-2 border-rule" />

          <BreakdownRow
            label="Total"
            value={fmt(result.total)}
            className="!text-brand text-[14px] font-extrabold pt-1"
          />

          {result.contingencyPrice > 0 && (
            <div className="mt-4 p-3 bg-canvas border border-rule rounded-lg">
              <div className="text-[11px] uppercase tracking-wider font-bold text-muted mb-1">
                Permit Contingency
              </div>
              <div className="text-[12px] text-muted leading-snug">
                If the fire permit is denied, the reduced 50-person price is{" "}
                <span className="font-bold text-ink">{fmt(result.contingencyPrice)}</span>.
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
