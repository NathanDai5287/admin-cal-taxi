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
 * If `breakdown` is missing OR `target` is non-positive, returns a single
 * generic line so the user can fill it in manually.
 */
export function buildLineItems(
  breakdown: PricingBreakdown | null,
  target: number,
  eventDateReadable: string,
): LineItem[] {
  // Components in display order. Each is the *raw* (pre-wealth) amount
  // — that's what the breakdown stores in .base/.alcohol/etc.
  type Comp = { description: string; raw: number };
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

  // Scale each component to the negotiated total. The last line absorbs
  // any rounding remainder so the sum is exact.
  const scale = target / rawSum;
  const lines: LineItem[] = [];
  let runningSum = 0;
  components.forEach((c, i) => {
    const isLast = i === components.length - 1;
    const value = isLast
      ? roundCents(target - runningSum)
      : roundCents(c.raw * scale);
    runningSum = roundCents(runningSum + value);
    lines.push({ description: c.description, amount: value.toFixed(2) });
  });
  return lines;
}
