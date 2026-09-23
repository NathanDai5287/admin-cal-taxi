/**
 * Rental invoice line-item builder — moved from app/host/invoice/page.tsx.
 * Only the documents step uses it (the rental invoice row).
 */

import type { LineItem } from "@/components/host/LineItemList";
import type { PricingBreakdown } from "@/lib/host-shared-state";
import { roundCents } from "@/lib/host-format";

/**
 * Build itemized rental invoice lines from the pricing breakdown, scaled
 * proportionally to the negotiated total. Produces no separate
 * "relationship discount/surcharge" row — the relationship adjustment is
 * already baked into `target`, and individual components scale to match.
 *
 * The fire permit is a real pass-through fee (a constant $125): it always
 * prints at its raw amount; the other lines scale to `target` minus it.
 *
 * If `breakdown` is missing OR `target` is non-positive, returns a single
 * generic line so the user can fill it in manually.
 */
export function buildLineItems(
  breakdown: PricingBreakdown | null,
  target: number,
  eventDateReadable: string,
): LineItem[] {
  // Components in display order. Each is the *raw* (pre-wealth) amount
  // — that's what the breakdown stores in .base/.alcohol/etc. `fixed`
  // marks pass-through fees that never scale or round (the fire permit).
  type Comp = { description: string; raw: number; fixed?: boolean };
  const components: Comp[] = [];

  if (breakdown) {
    components.push({ description: "Base rental — Theta Xi Fraternity House", raw: breakdown.base });
    if (breakdown.capacity > 0) {
      const over = Math.max(0, breakdown.guests - breakdown.capacityThreshold);
      components.push({
        description: `Capacity fee — ${breakdown.guests} guests (${over} over included threshold)`,
        raw: breakdown.capacity,
      });
    }
    if (breakdown.firePermit > 0) {
      components.push({
        description: "Fire permit (Required for > 50 guests)",
        raw: breakdown.firePermit,
        fixed: true,
      });
    }
    if (breakdown.alcohol > 0)
      components.push({ description: `Alcohol — ${breakdown.alcoholLabel}`, raw: breakdown.alcohol });
    if (breakdown.protection > 0)
      components.push({ description: `Property protection — ${breakdown.protectionLabel}`, raw: breakdown.protection });
    if (breakdown.date > 0)
      components.push({ description: `Date surcharge — ${breakdown.dateLabel}`, raw: breakdown.date });
    if (breakdown.setup > 0)
      components.push({ description: `Setup — ${breakdown.setupLabel}`, raw: breakdown.setup });
    if (breakdown.cleanup > 0)
      components.push({ description: `Cleanup — ${breakdown.cleanupLabel}`, raw: breakdown.cleanup });
  }

  const rawSum = components.reduce((s, c) => s + c.raw, 0);

  // Fall back to a single line if we can't itemize meaningfully.
  if (components.length === 0 || rawSum <= 0 || !(target > 0)) {
    const desc = eventDateReadable
      ? `Rental of the Theta Xi Fraternity House for the event on ${eventDateReadable}`
      : "Rental of the Theta Xi Fraternity House";
    return [{ description: desc, amount: target > 0 ? target.toFixed(2) : "" }];
  }

  // Fixed fees (the $125 fire permit) print at their raw amount and never
  // scale or round. The remaining lines scale to the negotiated total
  // minus the pinned fees.
  const scalable = components.filter(c => !c.fixed);
  const pinnedSum = rawSum - scalable.reduce((s, c) => s + c.raw, 0);
  const poolRawSum = scalable.reduce((s, c) => s + c.raw, 0);
  const poolAim = target - pinnedSum;
  // Degenerate case (negotiated total at or below the pinned fees): scale
  // everything including the permit so the total stays exact.
  const pinFees = poolRawSum > 0 && poolAim > 0;
  const pool = pinFees ? scalable : components;
  const poolSum = pinFees ? poolRawSum : rawSum;
  const poolTarget = pinFees ? poolAim : target;

  // Scale each pool component to its share of the target.
  const scale = poolTarget / poolSum;
  const exact = pool.map(c => c.raw * scale);

  // When the negotiated total differs from the raw breakdown, the scaled
  // amounts come out ugly ($1,306.66) — round to multiples of $10 that
  // still sum to the exact total. When no scaling is applied, keep the
  // exact raw amounts.
  let poolValues = Math.abs(poolTarget - poolSum) > 0.005
    ? roundToTens(exact, poolTarget)
    : scaleToCents(pool, poolTarget, poolSum);

  // A line rounded down to $0.00 reads as a mistake on the invoice — if
  // $10-rounding would zero one out, fall back to exact cents instead.
  if (poolValues.some(v => v <= 0)) {
    poolValues = scaleToCents(pool, poolTarget, poolSum);
  }

  // Reassemble in display order; pinned lines keep their raw amount.
  const valueOf = new Map(pool.map((c, i) => [c, poolValues[i]]));
  return components.map(c => ({
    description: c.description,
    amount: (pinFees && c.fixed ? c.raw : valueOf.get(c)!).toFixed(2),
  }));
}

/**
 * Round exact amounts to multiples of $10 while keeping the sum exactly equal
 * to `target`: floor each to the $10 grid, then hand the remaining $10 chunks
 * to the lines with the largest fractional remainders (largest-remainder
 * apportionment). Each line moves by less than $10 from its exact value. If
 * `target` itself isn't a multiple of $10, the sub-$10 leftover lands on the
 * largest line so the total stays exact.
 */
function roundToTens(exact: number[], target: number): number[] {
  const tens = exact.map(v => Math.floor(v / 10));
  let chunksLeft = Math.floor(target / 10) - tens.reduce((s, t) => s + t, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, frac: v / 10 - Math.floor(v / 10) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of byRemainder) {
    if (chunksLeft <= 0) break;
    tens[i] += 1;
    chunksLeft -= 1;
  }
  const values = tens.map(t => t * 10);
  const leftover = roundCents(target - values.reduce((s, v) => s + v, 0));
  if (Math.abs(leftover) > 0.005) {
    let largest = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[largest]) largest = i;
    values[largest] = roundCents(values[largest] + leftover);
  }
  return values;
}

/**
 * Proportional scaling rounded to exact cents, with any rounding drift
 * absorbed by the largest line so the sum matches `target` exactly.
 */
function scaleToCents(components: { raw: number }[], target: number, rawSum: number): number[] {
  const values = components.map(c => roundCents((c.raw * target) / rawSum));
  const drift = roundCents(target - values.reduce((s, v) => s + v, 0));
  if (Math.abs(drift) > 0.005) {
    let largest = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[largest]) largest = i;
    values[largest] = roundCents(values[largest] + drift);
  }
  return values;
}
