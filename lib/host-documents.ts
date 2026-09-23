/**
 * The four generatable documents: metadata, request payloads, and readiness.
 *
 * Payload construction used to live inline in the contract and invoice pages.
 * It lives here now because two places need to agree on it exactly — the
 * documents step that first generates a PDF, and the archive that regenerates
 * one later by replaying the stored payload. If these drift, an archived
 * document stops reproducing.
 */

import { formatDateISO } from "./host-format";
import { effective, effectiveRentalPrice } from "./host-derive";
import { cleanClubs, clubsDisplay } from "./host-clubs";
import type { LineItem } from "@/components/host/LineItemList";
import type { DocumentKind } from "./host-orders-types";
import type { AreaKey, SharedState } from "./host-shared-state";

export const AREAS: { key: AreaKey; label: string; clearedDesc: string }[] = [
  { key: "living_room", label: "Living Room", clearedDesc: "the couches, tables, and carpet" },
  { key: "dining_room", label: "Dining Room", clearedDesc: "the dining table and chairs" },
  { key: "backyard",    label: "Backyard",    clearedDesc: "everything off the cement area in the center" },
];

export type DocumentMeta = {
  kind: DocumentKind;
  label: string;
  /** One line describing when this document is issued. */
  subtitle: string;
  /** Backend route, via the /api/host/generate/* rewrite. */
  endpoint: string;
};

export const DOCUMENT_META: Record<DocumentKind, DocumentMeta> = {
  contract: {
    kind: "contract",
    label: "Hosting Contract",
    subtitle: "Signed before the event",
    endpoint: "/api/host/generate/contract",
  },
  deposit_invoice: {
    kind: "deposit_invoice",
    label: "Security Deposit Invoice",
    subtitle: "Due before the event",
    endpoint: "/api/host/generate/invoice/deposit",
  },
  rental_invoice: {
    kind: "rental_invoice",
    label: "Rental Payment Invoice",
    subtitle: "Itemized, issued after the event",
    endpoint: "/api/host/generate/invoice/rental",
  },
  credit_memo: {
    kind: "credit_memo",
    label: "Deposit Refund",
    subtitle: "Credit memo, after the deposit is returned",
    endpoint: "/api/host/generate/credit-memo",
  },
};

/** Display order on the documents step and the order detail page. */
export const DOCUMENT_ORDER: DocumentKind[] = [
  "contract", "deposit_invoice", "rental_invoice", "credit_memo",
];

// ─── Per-document local fields ───────────────────────────────────────────────
// Values that belong to one document and aren't worth putting in SharedState.

export type ContractFields = { sign: boolean };

export type DepositFields = {
  amount: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
};

export type RentalFields = {
  items: LineItem[];
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
};

export type CreditMemoFields = {
  amount: string;
  issueDate: string;
  originalInvoice: string;
  refundMethod: string;
  refundDescription: string;
  memoNumber: string;
};

// ─── Payload builders ────────────────────────────────────────────────────────

/** Attach the treasurer contact block when it's been filled in. */
function withTreasurer(
  body: Record<string, unknown>,
  d: SharedState,
): Record<string, unknown> {
  if (d.treasurerName)    body.treasurer_name    = d.treasurerName;
  if (d.treasurerContact) body.treasurer_contact = d.treasurerContact;
  return body;
}

/**
 * Attach the renting organization(s). `club_name` is the display join
 * ("Alpha and Beta") used by invoices and as a fallback; `club_names` is the
 * structured list the contract uses to introduce "Club 1", "Club 2", … and
 * define "the Renter".
 */
function withClubs(
  body: Record<string, unknown>,
  d: SharedState,
): Record<string, unknown> {
  body.club_name = clubsDisplay(d.clubs);
  body.club_names = cleanClubs(d.clubs);
  return body;
}

export function buildContractPayload(
  d: SharedState,
  f: ContractFields,
): Record<string, unknown> {
  const selectedAreas = AREAS.filter(a => d.areas[a.key]).map(a => a.key);
  const clearedMap: Record<string, boolean> = {};
  selectedAreas.forEach(k => { clearedMap[k] = d.cleared[k]; });

  // Cleanup tiers went 3 → 2; clamp any stored index from the old range.
  const cleanupIdx = Math.min(Math.max(d.pricingSelections.cleanup, 0), 1);

  return withClubs({
    date:       formatDateISO(d.eventDate),
    start_time: d.startTime,
    end_time:   d.endTime,
    price:      effectiveRentalPrice(d),
    deposit:    effective(d, "depositAmount"),
    max_guests: effective(d, "maxGuests"),
    monitors:   d.monitors,
    cleanup_tier: cleanupIdx === 1 ? "full" : "basic",
    areas:      selectedAreas,
    cleared:    clearedMap,
    guest_list:      d.guestList,
    sound_system:    d.soundSystem,
    lighting_system: d.lightingSystem,
    sign: f.sign,
  }, d);
}

export function buildDepositPayload(
  d: SharedState,
  f: DepositFields,
): Record<string, unknown> {
  const body: Record<string, unknown> = withClubs({
    event_date: formatDateISO(d.eventDate),
    amount:     f.amount,
    issue_date: formatDateISO(f.issueDate),
    due_date:   formatDateISO(f.dueDate),
    // Forfeiture clause 3c cites the contract's 4a attendance cap.
    max_guests: effective(d, "maxGuests"),
  }, d);
  if (f.invoiceNumber) body.invoice_number = f.invoiceNumber;
  return withTreasurer(body, d);
}

export function buildRentalPayload(
  d: SharedState,
  f: RentalFields,
): Record<string, unknown> {
  const body: Record<string, unknown> = withClubs({
    event_date: formatDateISO(d.eventDate),
    issue_date: formatDateISO(f.issueDate),
    due_date:   formatDateISO(f.dueDate),
    line_items: f.items.map(it => ({ description: it.description, amount: it.amount })),
  }, d);
  if (f.invoiceNumber) body.invoice_number = f.invoiceNumber;
  return withTreasurer(body, d);
}

export function buildCreditMemoPayload(
  d: SharedState,
  f: CreditMemoFields,
): Record<string, unknown> {
  const body: Record<string, unknown> = withClubs({
    event_date:       formatDateISO(d.eventDate),
    amount:           f.amount,
    issue_date:       formatDateISO(f.issueDate),
    original_invoice: f.originalInvoice,
  }, d);
  if (f.refundMethod)      body.refund_method      = f.refundMethod;
  if (f.refundDescription) body.refund_description = f.refundDescription;
  if (f.memoNumber)        body.memo_number        = f.memoNumber;
  return withTreasurer(body, d);
}

// ─── Readiness ───────────────────────────────────────────────────────────────

/** "HH:MM" within real clock ranges. */
function isValidTime(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/** Positive finite number from a user-typed string. */
function positiveAmount(s: string | undefined): boolean {
  if (!s) return false;
  const n = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0;
}

/** Non-negative whole number from a user-typed string. */
function nonNegativeInt(s: string): boolean {
  const n = parseFloat(s.trim());
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

/**
 * Why a document can't be generated yet, as user-facing field names. Empty
 * array means ready. The documents step turns this into a status pill, so the
 * strings should read naturally after "Missing: ". Presence alone isn't
 * enough — a value that would make the backend reject (or worse, print
 * nonsense on a signed document) is reported here first.
 */
export function missingFields(
  kind: DocumentKind,
  d: SharedState,
  fields: Partial<{
    contract: ContractFields;
    deposit: DepositFields;
    rental: RentalFields;
    creditMemo: CreditMemoFields;
  }>,
): string[] {
  const missing: string[] = [];
  const need = (ok: unknown, label: string) => { if (!ok) missing.push(label); };

  // Every document is addressed to an organization for a dated event.
  need(cleanClubs(d.clubs).length > 0, "organization");
  need(d.eventDate.trim(), "event date");

  switch (kind) {
    case "contract":
      need(isValidTime(d.startTime), "valid start time");
      need(isValidTime(d.endTime), "valid end time");
      need(positiveAmount(effectiveRentalPrice(d)), "a positive rental fee (pricing step)");
      need(positiveAmount(effective(d, "depositAmount")), "a positive security deposit (pricing step)");
      need(positiveAmount(effective(d, "maxGuests")), "a positive maximum guests (event details step)");
      need(nonNegativeInt(d.monitors), "sober monitors");
      break;
    case "deposit_invoice":
      need(positiveAmount(fields.deposit?.amount), "a positive deposit amount");
      need(fields.deposit?.issueDate, "issue date");
      need(fields.deposit?.dueDate, "due date");
      break;
    case "rental_invoice":
      need(fields.rental?.issueDate, "issue date");
      need(fields.rental?.dueDate, "due date");
      need(fields.rental?.items.length, "line items");
      break;
    case "credit_memo": {
      need(positiveAmount(fields.creditMemo?.amount), "a positive refund amount");
      need(fields.creditMemo?.issueDate, "issue date");
      need(fields.creditMemo?.originalInvoice, "original deposit invoice number");
      // Refunding more than the deposit on file is a typo, not generosity.
      const refund = parseFloat(String(fields.creditMemo?.amount ?? "").replace(/[$,\s]/g, ""));
      const depositHeld = parseFloat(effective(d, "depositAmount"));
      if (Number.isFinite(refund) && Number.isFinite(depositHeld) && depositHeld > 0 && refund > depositHeld) {
        missing.push("refund not exceeding the security deposit");
      }
      break;
    }
  }
  return missing;
}

/** Total of a line-item list, tolerating mid-typing garbage. */
export function lineItemsTotal(items: LineItem[]): number {
  return items.reduce((acc, it) => {
    const n = parseFloat(String(it.amount).replace(/[$,\s]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * A stable number for a contract. The backend names contract PDFs
 * `theta_xi_<club>_contract.pdf` with no identifier, so the archive mints one
 * in the same shape as the invoice numbers the backend does produce.
 */
export function mintContractNumber(clubName: string, eventDate: string): string {
  const club = (clubName.replace(/[^A-Za-z]/g, "").toUpperCase() + "XXXXXX").slice(0, 6);
  const date = (eventDate || "").replace(/-/g, "");
  const ymd = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4)}` : "0000-0000";
  return `CTR-${ymd}-${club}`;
}
