import type { Order, DocumentKind } from './host-orders-types';
import { sharedStateFromSnapshot } from './host-state-model';
import { savedPricing } from './host-saved-pricing';
import { addDaysIso, formatDateISO, todayIso } from './host-format';
import { DOCUMENT_ORDER, buildContractPayload, buildDepositPayload, buildRentalPayload, buildCreditMemoPayload, missingFields, mintContractNumber } from './host-documents';
import { buildLineItems } from '../app/(admin)/host/documents/build-line-items';

/** Missing unsigned PDFs use this order's details, never the Create workspace. */
export function defaultDocuments(order: Order, depositNumber?: string) {
  const saved = sharedStateFromSnapshot(order.snapshot);
  const data = {
    ...saved,
    clubs: saved.clubs.length ? saved.clubs : [order.clubName],
    eventDate: order.eventDate,
    finalPrice: String(order.rentalPrice ?? ""),
    depositAmount: String(order.depositAmount ?? ""),
    overrides: { ...saved.overrides, finalPrice: true, depositAmount: true },
  };
  const issueDate = todayIso();
  const invoiceNumber = depositNumber || saved.lastDepositInvoiceNumber || mintContractNumber(data.clubs[0] ?? "partner", order.eventDate).replace(/^CTR-/, "DEP-");
  const fields = {
    contract: { sign: saved.contractPresign },
    deposit: { amount: data.depositAmount, issueDate, dueDate: addDaysIso(order.eventDate, -7), invoiceNumber },
    rental: { items: buildLineItems(savedPricing(order.snapshot.pricingBreakdown), order.rentalPrice ?? 0, formatDateISO(order.eventDate)), issueDate, dueDate: addDaysIso(order.eventDate, 2), invoiceNumber: "" },
    creditMemo: { amount: data.depositAmount, issueDate, originalInvoice: invoiceNumber, refundMethod: "", refundDescription: "", memoNumber: "" },
  };
  const payloads = {
    contract: buildContractPayload(data, fields.contract),
    deposit_invoice: buildDepositPayload(data, fields.deposit),
    rental_invoice: buildRentalPayload(data, fields.rental),
    credit_memo: buildCreditMemoPayload(data, fields.creditMemo),
  };
  const missing = Object.fromEntries(DOCUMENT_ORDER.map(kind => [kind,
    kind === "rental_invoice" && (!Number.isFinite(order.rentalPrice) || (order.rentalPrice ?? 0) <= 0)
      ? ["a positive rental fee"]
      : missingFields(kind, data, fields),
  ])) as Record<DocumentKind, string[]>;
  return { payloads, missing };
}
