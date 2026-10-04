import { EMPTY_STATE, type SharedState } from "../../lib/host-state-model";
import { liveBreakdown } from "../../lib/host-derive";
import { orderSnapshot } from "../../lib/host-order-snapshot";
import type { Order } from "../../lib/host-orders-types";
import type { SigningRevision } from "../../lib/host-signing";

export const EXAMPLE_ORDER_ID = "ord_local_five_people";
const KEY = "host.flow.preview.v1";
export const samplePeople = ["Alex Rivera", "Jordan Chen", "Sam Patel", "Casey Morgan", "Taylor Lee"];
export function exampleDraft(): SharedState {
  const clubs = ["Robotics Club", "Solar Racing", "Data Science Club", "Design Club", "Film Society"];
  return { ...structuredClone(EMPTY_STATE), clubs, eventDate: "2026-10-16", numGuests: "200", startTime: "19:00", endTime: "23:00", monitors: "4", finalPrice: "1400", depositAmount: "300", contractPresign: true,
    overrides: { finalPrice: true, depositAmount: true, maxGuests: false }, areas: { living_room: true, dining_room: false, backyard: true },
    contractSigners: samplePeople.map((fullName, index) => ({ id: `local-person-${index}`, fullName, email: `person${index + 1}@example.test`, club: clubs[index] })) };
}
export type PreviewData = { orders: Order[]; revisions: Record<string, SigningRevision[]>; finance: Record<string, { included: boolean; payments: { id: string; kind: "revenue" | "fire_permit"; amount: number; paidDate: string; reversedAt: string | null }[] }> };
function initial(): PreviewData {
  const draft = { ...exampleDraft(), documentContextId: EXAMPLE_ORDER_ID };
  const order: Order = { id: EXAMPLE_ORDER_ID, clubName: draft.clubs.join(", ").replace(/, ([^,]*)$/, ", and $1"), eventDate: draft.eventDate, rentalPrice: 1400, depositAmount: 300, snapshot: orderSnapshot(draft), documents: [], notes: "Local sample: five representatives awaiting signatures. This is not your live order.", statusOverride: null, createdAt: "2026-10-01T18:00:00Z", updatedAt: "2026-10-01T18:00:00Z" };
  order.snapshot.pricingBreakdown = liveBreakdown(draft);
  const revision: SigningRevision = { id: "sig_local_pending", order_id: order.id, revision: 1, state: "awaiting_signatures", original_sha256: "local-preview", envelope_id: "local-envelope", signedCount: 0, totalCount: 5,
    files: { original: true, completed: false, audit: false }, error: null, created_at: order.createdAt,
    recipients: draft.contractSigners.map((person, i) => ({ id: i + 1, name: person.fullName, email: person.email, status: "NOT_SIGNED", link: `https://example.test/preview-sign/${person.id}`, sentAt: order.createdAt, copyToken: `local-copy-${i}` })) };
  return { orders: [order], revisions: { [order.id]: [revision] }, finance: { [order.id]: { included: true, payments: [] } } };
}
export function read(): PreviewData {
  const saved = localStorage.getItem(KEY);
  if (saved) return JSON.parse(saved);
  const value = initial(); localStorage.setItem(KEY, JSON.stringify(value)); return value;
}
export function write(value: PreviewData) {
  localStorage.setItem(KEY, JSON.stringify(value)); window.dispatchEvent(new Event("preview-data"));
}
export function reset() { localStorage.removeItem(KEY); write(initial()); }
