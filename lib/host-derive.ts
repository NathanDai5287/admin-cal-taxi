/**
 * Derived-field resolution for the /host flow.
 *
 * Several fields on the contract step are *downstream* of the pricing step:
 * the rental fee follows the negotiated price, the deposit follows the
 * calculator's suggestion, max guests follows the headcount. Previously each
 * one was copied into shared state by a mount-effect that only wrote when the
 * target was empty — so the value froze at whatever the first visit produced
 * and never tracked later pricing changes.
 *
 * Instead, nothing derived is stored. Shared state holds only *user intent*:
 * `overrides[key]` says whether the user has taken manual control of a field.
 * While that flag is false the field is recomputed from its source on every
 * render, so it can never go stale.
 */

import type { OverrideKey, SharedState } from "./host-shared-state";

/** Round a dollar amount to a whole-number string; "" when there's nothing. */
function dollars(n: number | undefined | null): string {
  return typeof n === "number" && n > 0 ? String(Math.round(n)) : "";
}

/**
 * The live value each derived field takes when the user hasn't overridden it.
 *
 * `rentalPrice` resolves through `finalPrice` rather than reading the raw
 * breakdown, so the cascade is: calculator total → negotiated price →
 * contract fee. Overriding the negotiated price moves the contract fee with
 * it; overriding the fee as well detaches only the fee.
 */
const AUTO: Record<OverrideKey, (d: SharedState) => string> = {
  finalPrice:    d => dollars(d.pricingBreakdown?.total),
  rentalPrice:   d => effective(d, "finalPrice"),
  depositAmount: d => dollars(d.pricingBreakdown?.suggestedDeposit),
  maxGuests:     d => d.numGuests,
};

/** What the field would be if the user hadn't touched it. "" when unknowable. */
export function autoValue(d: SharedState, key: OverrideKey): string {
  return AUTO[key](d);
}

/** The value to display and submit: the user's if they took control, else live. */
export function effective(d: SharedState, key: OverrideKey): string {
  return d.overrides[key] ? d[key] : AUTO[key](d);
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
