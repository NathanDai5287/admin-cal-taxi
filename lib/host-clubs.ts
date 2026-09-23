/**
 * Multi-organization helpers for the /host flow.
 *
 * Shared state carries `clubs: string[]` — one entry per organization
 * sharing the event. The backend contract introduces them as "Club 1",
 * "Club 2", … and then refers to them collectively as "the Renter".
 */

/** Trimmed, non-empty organization names, in order. */
export function cleanClubs(clubs: string[]): string[] {
  return clubs.map(c => c.trim()).filter(Boolean);
}

/**
 * English-list join for display and for the `club_name` payload field:
 * "Alpha", "Alpha and Beta", "Alpha, Beta, and Gamma". No "the" prefix —
 * these are proper nouns.
 */
export function clubsDisplay(clubs: string[]): string {
  const list = cleanClubs(clubs);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

/** True when more than one organization shares the event. */
export function isMultiClub(clubs: string[]): boolean {
  return cleanClubs(clubs).length > 1;
}
