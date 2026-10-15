import { addDaysIso, formatDateISO } from "./host-format";
import { sharedStateFromSnapshot, type SharedState } from "./host-state-model";
import type { Order, OrderDocument } from "./host-orders-types";

type EventTerms = Pick<SharedState, "eventDate" | "startTime" | "endTime" | "rentalPaymentTiming">;
type InvoiceKind = "deposit_invoice" | "rental_invoice";

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
  return formatDateISO(kind === "deposit_invoice" ? schedule.depositDueDate : schedule.rentalDueDate);
}
