import { addDaysIso, formatDateISO } from "./host-format";
import { sharedStateFromSnapshot, type SharedState } from "./host-state-model";
import type { Order, OrderDocument } from "./host-orders-types";

type EventTerms = Pick<SharedState, "eventDate" | "startTime" | "endTime" | "rentalPaymentTiming">;
type InvoiceKind = "deposit_invoice" | "rental_invoice";

export function formatRentalDeadline(date: string, timing: SharedState["rentalPaymentTiming"]): string {
  const formatted = formatDateISO(date);
  return timing === "day_before" && !formatted.includes("11:59")
    ? `${formatted || "the day before the event"} at 11:59 p.m. Pacific Time` : formatted;
}

/** Adopt the new policy only while an agreement is still an unissued draft. */
export function contractDraftPaymentTiming(
  order: Pick<Order, "snapshot" | "documents">,
  revisions?: { state: string; envelope_id: string | null }[],
): SharedState["rentalPaymentTiming"] {
  const saved = sharedStateFromSnapshot(order.snapshot).rentalPaymentTiming;
  if (saved === "day_before" || !revisions || order.documents.some(document => document.kind === "contract") ||
      revisions.some(revision => revision.envelope_id || !["preview", "failed", "cancelled"].includes(revision.state))) return saved;
  return "day_before";
}

function minutesAfterMidnight(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function paymentSchedule(terms: EventTerms) {
  const overnight = terms.startTime && terms.endTime && minutesAfterMidnight(terms.endTime) <= minutesAfterMidnight(terms.startTime);
  const eventEndDate = addDaysIso(terms.eventDate, overnight ? 1 : 0);
  return {
    eventEndDate,
    depositDueDate: addDaysIso(terms.eventDate, -7),
    rentalDueDate: terms.rentalPaymentTiming === "day_before"
      ? addDaysIso(terms.eventDate, -1) : addDaysIso(eventEndDate, 2),
  };
}

export function orderPaymentSchedule(order: Pick<Order, "eventDate" | "snapshot">) {
  return paymentSchedule({ ...sharedStateFromSnapshot(order.snapshot), eventDate: order.eventDate });
}

export function orderInvoiceDueDate(order: Order, kind: InvoiceKind): string {
  const invoice = order.documents.filter(document => document.kind === kind && !document.stale && document.sourceSnapshot)
    .reduce<OrderDocument | null>((latest, document) => !latest || document.generatedAt > latest.generatedAt ? document : latest, null);
  if (typeof invoice?.payload.due_date === "string" && invoice.payload.due_date) return invoice.payload.due_date;
  const schedule = orderPaymentSchedule(order);
  return kind === "deposit_invoice" ? formatDateISO(schedule.depositDueDate)
    : formatRentalDeadline(schedule.rentalDueDate, sharedStateFromSnapshot(order.snapshot).rentalPaymentTiming);
}
