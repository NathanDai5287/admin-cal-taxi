/**
 * Derived-field resolution for the /host flow.
 *
 * Several fields are *downstream* of earlier inputs: the negotiated price
 * follows the calculator, the deposit follows the calculator's suggestion,
 * max guests follows the headcount. Previously each one was copied into
 * shared state by a mount-effect that only wrote when the target was empty —
 * so the value froze at whatever the first visit produced and never tracked
 * later changes.
 *
 * Instead, nothing derived is stored. Shared state holds only *user intent*:
 * `overrides[key]` says whether the user has taken manual control of a field.
 * While that flag is false the field is recomputed from its source on every
 * render, so it can never go stale.
 */

import { computePricing } from "./host-pricing";
import type { OverrideKey, PricingBreakdown, SharedState } from "./host-shared-state";

/** Round a dollar amount to a whole-number string; "" when there's nothing. */
function dollars(n: number | undefined | null): string {
  return typeof n === "number" && n > 0 ? String(Math.round(n)) : "";
}

/**
 * The pricing breakdown for the current inputs, computed on the spot. null
 * when no guest count has been entered — before that, any total would be
 * fiction (the base rate alone would produce one).
 */
export function liveBreakdown(d: SharedState): PricingBreakdown | null {
  const guests = parseInt(d.numGuests, 10);
  if (!Number.isFinite(guests) || guests <= 0) return null;
  return computePricing(guests, d.pricingSelections);
}

/**
 * The live value each derived field takes when the user hasn't overridden it.
 *
 * The contract's rental fee is the negotiated price — there is no separate
 * fee override; to move the fee, move the negotiated price on the pricing
 * step.
 */
const AUTO: Record<OverrideKey, (d: SharedState) => string> = {
  finalPrice:    d => dollars(liveBreakdown(d)?.total),
  depositAmount: d => dollars(liveBreakdown(d)?.suggestedDeposit),
  maxGuests:     d => d.numGuests,
};

/** What the field would be if the user hadn't touched it. "" when unknowable. */
export function autoValue(d: SharedState, key: OverrideKey): string {
  return AUTO[key](d);
}

/** The value to display and submit: the user's if they took control, else live. */
export function effective(d: SharedState, key: OverrideKey): string {
  if (key === "maxGuests") return d.numGuests;
  return d.overrides[key] ? d[key] : AUTO[key](d);
}

/** The contract's rental fee — always the negotiated price. */
export function effectiveRentalPrice(d: SharedState): string {
  return effective(d, "finalPrice");
}

/** True when the user's value has actually diverged from the live one. */
export function hasDiverged(d: SharedState, key: OverrideKey): boolean {
  if (!d.overrides[key]) return false;
  const auto = AUTO[key](d);
  if (!auto) return d[key] !== "";
  // Compare numerically where possible so "1500" and "1500.00" agree.
  const a = parseFloat(auto);
  const b = parseFloat(d[key]);
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) > 0.5;
  return auto !== d[key];
}
