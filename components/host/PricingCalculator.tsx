"use client";

import { useEffect, useMemo } from "react";
import {
  AmountTier,
  MultiplierTier,
  PRICING_CONSTANTS,
  RelationshipTier,
} from "@/lib/host-pricing-constants";
import { useSharedData, PricingSelections } from "@/lib/host-shared-state";

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

  // Guests reads/writes shared.numGuests; coerced to a number for calc.
  const guestsNum = Math.max(0, parseInt(data.numGuests) || 0);

  // Selection helpers — read from shared.pricingSelections.
  const sel = data.pricingSelections;
  const setSel = (k: keyof PricingSelections) => (i: number) =>
    update("pricingSelections", { ...sel, [k]: i });

  const result = useMemo(() => {
    const Cp = Math.max(guestsNum - C.capacityThreshold, 0) * C.perGuestRate;
    const firePermit = guestsNum > C.firePermitThreshold ? C.firePermitAmount : 0;
    const A = C.alcoholTiers[sel.alcohol].amount;
    const P = C.protectionTiers[sel.protection].amount;
    const D = C.dateTiers[sel.date].amount;
    const Su = C.setupTiers[sel.setup].amount;

    // Cleanup tiers were reduced from 3 → 2. Clamp any stored old values.
    const cleanupIdx = Math.min(Math.max(sel.cleanup, 0), C.cleanupTiers.length - 1);
    const Sc = C.cleanupTiers[cleanupIdx].amount;

    const W = C.wealthTiers[sel.wealth].multiplier;
    const relR = C.relationshipTiers[sel.relationship].r;
    const depositRate = C.relationshipTiers[sel.relationship].depositRate;

    const rawSum = C.baseRate + Cp + firePermit + A + P + D + Su + Sc;
    const postW = rawSum * W;
    const adj = postW * relR;
    const total = Math.max(postW - adj, 0);

    // Permit contingency price (if > 50 guests):
    // ((total - 125) * (50 / n)) * 0.75
    let contingencyPrice = 0;
    if (guestsNum > C.firePermitThreshold) {
      const baseForScale = Math.max(0, total - C.firePermitAmount);
      contingencyPrice = (baseForScale * (C.firePermitThreshold / guestsNum)) * 0.75;
    }

    // Risk-adjusted collateral: higher trust → lower deposit; known-issue
    // groups pay more. Rounded to nearest $50, never below $100.
    const deposit = Math.max(Math.round((total * depositRate) / 50) * 50, 100);

    return {
      n: guestsNum, Cp, firePermit, A, P, D, Su, Sc, W, relR, depositRate,
      rawSum, postW, adj, total, contingencyPrice, deposit,
      // labels
      wealthLabel: C.wealthTiers[sel.wealth].label,
      relLabel:    C.relationshipTiers[sel.relationship].label,
      alcoholLabel:    C.alcoholTiers[sel.alcohol].label,
      protectionLabel: C.protectionTiers[sel.protection].label,
      dateLabel:       C.dateTiers[sel.date].label,
      setupLabel:      C.setupTiers[sel.setup].label,
      cleanupLabel:    C.cleanupTiers[cleanupIdx].label,
    };
  }, [C, guestsNum, sel]);

  // Persist computed breakdown to shared state — contract & invoice consume it.
  useEffect(() => {
    if (!hydrated) return;

    // Normalize any old stored cleanup selection (previously 0..2) into the
    // new 2-tier range (0..1) so we don't keep re-clamping every render.
    const cleanupIdx = Math.min(Math.max(sel.cleanup, 0), C.cleanupTiers.length - 1);
    if (sel.cleanup !== cleanupIdx) {
      update("pricingSelections", { ...sel, cleanup: cleanupIdx });
    }

    update("pricingBreakdown", {
      base: C.baseRate,
      capacity: result.Cp,
      firePermit: result.firePermit,
      alcohol: result.A,
      protection: result.P,
      date: result.D,
      setup: result.Su,
      cleanup: result.Sc,
      subtotal: result.rawSum,
      wealthMult: result.W,
      wealthLabel: result.wealthLabel,
      postW: result.postW,
      relR: result.relR,
      relLabel: result.relLabel,
      adj: result.adj,
      total: result.total,
      contingencyPrice: result.contingencyPrice,
      suggestedDeposit: result.deposit,
      depositRate: result.depositRate,
      alcoholLabel: result.alcoholLabel,
      protectionLabel: result.protectionLabel,
      dateLabel: result.dateLabel,
      setupLabel: result.setupLabel,
      cleanupLabel: result.cleanupLabel,
      guests: result.n,
      capacityThreshold: C.capacityThreshold,
      perGuestRate: C.perGuestRate,
    });
  }, [hydrated, result, C, update]);

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
            <input
              type="number"
              min={0}
              max={500}
              step={5}
              className="field-input max-w-[180px]"
              placeholder="e.g. 80"
              value={hydrated ? data.numGuests : ""}
              onChange={e => update("numGuests", e.target.value)}
            />
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
            <RadioGroup name="cleanup" tiers={C.cleanupTiers} selected={Math.min(Math.max(sel.cleanup, 0), C.cleanupTiers.length - 1)}
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
            <span className="text-ink font-medium">{fmt(result.deposit)}</span>
            <span className="text-muted">
              {" "}({Math.round(result.depositRate * 100)}% — {result.relLabel.split(" — ")[0]})
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 border-t border-rule pt-3">
          <BreakdownRow label="Base rate" value={fmt(C.baseRate)} />
          <BreakdownRow
            label={`Capacity (${Math.max(0, guestsNum - C.capacityThreshold)} × $${C.perGuestRate.toFixed(2)})`}
            value={result.Cp > 0 ? `+${fmt(result.Cp)}` : "$0"}
            dim={result.Cp === 0}
          />
          <BreakdownRow
            label="Fire permit (Required for > 50 guests)"
            value={result.firePermit > 0 ? `+${fmt(result.firePermit)}` : "$0"}
            dim={result.firePermit === 0}
          />
          <BreakdownRow
            label={`Alcohol — ${result.alcoholLabel}`}
            value={result.A > 0 ? `+${fmt(result.A)}` : "$0"}
            dim={result.A === 0}
          />
          <BreakdownRow
            label={`Protection — ${result.protectionLabel}`}
            value={result.P > 0 ? `+${fmt(result.P)}` : "$0"}
            dim={result.P === 0}
          />
          <BreakdownRow
            label={`Date — ${result.dateLabel}`}
            value={result.D > 0 ? `+${fmt(result.D)}` : "$0"}
            dim={result.D === 0}
          />
          <BreakdownRow
            label={`Setup — ${result.setupLabel}`}
            value={result.Su > 0 ? `+${fmt(result.Su)}` : "$0"}
            dim={result.Su === 0}
          />
          <BreakdownRow
            label={`Cleanup — ${result.cleanupLabel}`}
            value={result.Sc > 0 ? `+${fmt(result.Sc)}` : "$0"}
            dim={result.Sc === 0}
          />

          <hr className="my-2 border-rule" />

          <BreakdownRow label="Subtotal" value={fmt(result.rawSum)}
            className="font-bold !text-ink" />
          <BreakdownRow label={`Wealth ×${result.W.toFixed(2)}`}
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
