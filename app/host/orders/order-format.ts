/**
 * Formatting helpers local to the order archive (list + detail pages).
 *
 * Money elsewhere in /host rounds to whole dollars (it's negotiating a
 * price). The archive's ledger has to reconcile invoiced amounts exactly
 * against stored document amounts, so it keeps cents.
 */

/** "1234.5" → "$1,234.50". Negative values print as "-$…". */
export function fmtUSD(n: number): string {
  return (
    (n < 0 ? "-$" : "$") +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Same, but `null` renders as an em dash rather than "$0.00" — on an order
 * these mean different things (no price ever set vs. a deliberately free
 * rental), and collapsing them to "$0.00" would erase that distinction.
 */
export function fmtUSDOrDash(n: number | null): string {
  return n === null ? "—" : fmtUSD(n);
}

/**
 * "2026-05-05" → "2026". Falls back to "Unknown" for a blank/malformed date
 * so the list can still form a group and show something meaningful rather
 * than silently dropping the order.
 */
export function yearOf(iso: string): string {
  const m = /^(\d{4})-/.exec(iso);
  return m ? m[1] : "Unknown";
}
