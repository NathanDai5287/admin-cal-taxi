/**
 * Formatting helpers shared across /host pages.
 *
 * Dates: every input is a native `<input type="date">` which gives us
 * a canonical "YYYY-MM-DD" string. We display that as "May 5, 2026"
 * before sending to the PDF generator so the rendered documents read
 * naturally instead of like database keys.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-05-05" → "May 5, 2026". Falls back to the raw string when not ISO. */
export function formatDateISO(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d || mo < 1 || mo > 12) return iso;
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

/** Today as "YYYY-MM-DD" in local time (not UTC, so it matches the user's calendar). */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Round to 2 decimal places, returning a number (not a string). */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Add `days` days to an ISO date. UTC math so DST never shifts the result. */
export function addDaysIso(iso: string, days: number): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return iso;
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
