/**
 * Pure pricing math for the /host flow.
 *
 * This used to live inside <PricingCalculator>, which meant the breakdown
 * only existed while that component was mounted — every other page read a
 * copy persisted in shared state, and that copy went stale the moment the
 * guest count changed on another step. Now the breakdown is a pure function
 * of (guests, selections), recomputed wherever it's needed, so it can never
 * disagree with its inputs.
 */

import { PRICING_CONSTANTS } from "./host-pricing-constants";
import type { PricingBreakdown, PricingSelections } from "./host-shared-state";

/** Cleanup tiers went 3 → 2; clamp any stored index from the old range. */
export function clampCleanupIndex(i: number): number {
  return Math.min(Math.max(i, 0), PRICING_CONSTANTS.cleanupTiers.length - 1);
}

/** The full breakdown for a guest count + tier selections. */
export function computePricing(
  guestsNum: number,
  sel: PricingSelections,
): PricingBreakdown {
  const C = PRICING_CONSTANTS;
  const guests = Math.max(0, Math.floor(guestsNum) || 0);

  const capacity = Math.max(guests - C.capacityThreshold, 0) * C.perGuestRate;
  const firePermit = guests > C.firePermitThreshold ? C.firePermitAmount : 0;
  const alcohol = C.alcoholTiers[sel.alcohol].amount;
  const protection = C.protectionTiers[sel.protection].amount;
  const date = C.dateTiers[sel.date].amount;
  const setup = C.setupTiers[sel.setup].amount;
  const cleanupIdx = clampCleanupIndex(sel.cleanup);
  const cleanup = C.cleanupTiers[cleanupIdx].amount;

  const wealthMult = C.wealthTiers[sel.wealth].multiplier;
  const relR = C.relationshipTiers[sel.relationship].r;
  const depositRate = C.relationshipTiers[sel.relationship].depositRate;

  const subtotal = C.baseRate + capacity + firePermit + alcohol + protection + date + setup + cleanup;
  const postW = subtotal * wealthMult;
  const adj = postW * relR;
  const total = Math.max(postW - adj, 0);

  // Permit contingency price (if > 50 guests): ((total - 125) * (50 / n)) * 0.75
  let contingencyPrice = 0;
  if (guests > C.firePermitThreshold) {
    const baseForScale = Math.max(0, total - C.firePermitAmount);
    contingencyPrice = (baseForScale * (C.firePermitThreshold / guests)) * 0.75;
  }

  // Risk-adjusted collateral: higher trust → lower deposit; known-issue
  // groups pay more. Rounded to nearest $50, never below $100.
  const suggestedDeposit = Math.max(Math.round((total * depositRate) / 50) * 50, 100);

  return {
    base: C.baseRate,
    capacity,
    firePermit,
    alcohol,
    protection,
    date,
    setup,
    cleanup,
    subtotal,
    wealthMult,
    wealthLabel: C.wealthTiers[sel.wealth].label,
    postW,
    relR,
    relLabel: C.relationshipTiers[sel.relationship].label,
    adj,
    total,
    contingencyPrice,
    suggestedDeposit,
    depositRate,
    alcoholLabel: C.alcoholTiers[sel.alcohol].label,
    protectionLabel: C.protectionTiers[sel.protection].label,
    dateLabel: C.dateTiers[sel.date].label,
    setupLabel: C.setupTiers[sel.setup].label,
    cleanupLabel: C.cleanupTiers[cleanupIdx].label,
    guests,
    capacityThreshold: C.capacityThreshold,
    perGuestRate: C.perGuestRate,
  };
}
