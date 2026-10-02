/**
 * Shared vocabulary for the /host order archive.
 *
 * An **order** is one rental: an event, the pricing that was agreed, and every
 * document issued for it. It is the unit shown on /host/orders.
 *
 * These types are the contract between three places that must agree exactly:
 * the Flask/SQLite store on minmus, the server data client (lib/host-orders.ts),
 * and the pages that render them. Change them in lockstep.
 */

/** The four PDFs the generator can produce. Also the SQLite `kind` column. */
export type DocumentKind =
  | "contract"
  | "deposit_invoice"
  | "rental_invoice"
  | "credit_memo";

export const DOCUMENT_KINDS: DocumentKind[] = [
  "contract", "deposit_invoice", "rental_invoice", "credit_memo",
];

/** One issued PDF, recorded at the moment it was generated. */
export type OrderDocument = {
  id: string;
  /** Immutable document owner and approved inputs, verified by the archive. */
  expectedUpdatedAt?: string;
  generationReceipt?: string;
  sourceSnapshot?: Record<string, unknown>;
  stale?: boolean;
  kind: DocumentKind;
  /**
   * Invoice or memo number (e.g. "DEP-2026-0505-PISIGM"). The backend derives
   * these for invoices and memos, but contracts come back as a plain
   * `theta_xi_<club>_contract.pdf` with no number — those get one minted
   * client-side so every archived document is addressable.
   */
  number: string;
  filename: string;
  /** What this document is worth, for the ledger. Null when not monetary. */
  amount: number | null;
  /** ISO 8601 UTC. */
  generatedAt: string;
  /**
   * The exact JSON body that was POSTed to the generator. Replaying it
   * reproduces the PDF, which is why no blob storage is needed.
   *
   * Caveat: reproduction is only as stable as the Typst templates. If a
   * template changes, an old order regenerates with the new wording.
   */
  payload: Record<string, unknown>;
};

/**
 * Lifecycle of a rental. Normally derived from which documents exist
 * (see `deriveStatus`); `statusOverride` on the order wins when set, which is
 * how an order becomes "cancelled".
 */
export type OrderStatus =
  | "draft"
  | "contracted"
  | "invoiced"
  | "completed"
  | "cancelled";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft:      "Draft",
  contracted: "Contract PDF generated",
  invoiced:   "Billing documents generated",
  completed:  "Marked complete",
  cancelled:  "Cancelled",
};

export type Order = {
  id: string;
  /** ISO 8601 UTC. */
  createdAt: string;
  updatedAt: string;

  // Denormalised for the list view so it needn't parse every snapshot.
  clubName: string;
  /** "YYYY-MM-DD", matching <input type="date">. */
  eventDate: string;
  rentalPrice: number | null;
  depositAmount: number | null;

  /** Set to force a status; null means derive it from `documents`. */
  statusOverride: OrderStatus | null;
  notes: string;

  /**
   * Full SharedState at save time. Powers "load into workspace" — reopening a
   * months-old rental with its pricing tiers and contract terms intact.
   * Deliberately loose: SharedState evolves, and old snapshots must still load.
   */
  snapshot: Record<string, unknown>;

  documents: OrderDocument[];
};

/** Row shape for the list view — everything but `snapshot` and `documents`. */
export type OrderSummary = Omit<Order, "snapshot" | "documents"> & {
  documentCount: number;
  /** Kinds issued, so the list can show which of the four are done. */
  documentKinds: DocumentKind[];
};

/**
 * Status implied by the documents on an order. An explicit `statusOverride`
 * takes precedence — check it first.
 */
export function deriveStatus(order: {
  statusOverride: OrderStatus | null;
  documents: { kind: DocumentKind }[];
}): OrderStatus {
  if (order.statusOverride) return order.statusOverride;
  const kinds = new Set(order.documents.map(d => d.kind));
  if (kinds.has("credit_memo") || kinds.has("rental_invoice") || kinds.has("deposit_invoice")) return "invoiced";
  if (kinds.has("contract")) return "contracted";
  return "draft";
}

/** Same, for a summary row (which carries kinds instead of full documents). */
export function deriveSummaryStatus(s: OrderSummary): OrderStatus {
  return deriveStatus({
    statusOverride: s.statusOverride,
    documents: s.documentKinds.map(kind => ({ kind })),
  });
}

export type Ledger = {
  /** Deposit invoiced to the renter. */
  depositInvoiced: number;
  /** Rental payment invoiced. */
  rentalInvoiced: number;
  /** Deposit refunded via credit memo. */
  refunded: number;
  /** Net still owed to Theta Xi: invoiced minus refunded. */
  balance: number;
};

/**
 * Money summary for an order's detail page.
 *
 * This tracks what was *invoiced*, not what was *paid* — nothing in the app
 * records invoice totals here. Recorded payments are managed separately;
 * `balance` is net invoiced, not a real accounts-receivable figure.
 */
export function computeLedger(documents: OrderDocument[]): Ledger {
  const sum = (kind: DocumentKind) =>
    documents
      .filter(d => d.kind === kind)
      .reduce((acc, d) => acc + (d.amount ?? 0), 0);

  const depositInvoiced = sum("deposit_invoice");
  const rentalInvoiced  = sum("rental_invoice");
  const refunded        = sum("credit_memo");

  return {
    depositInvoiced,
    rentalInvoiced,
    refunded,
    balance: depositInvoiced + rentalInvoiced - refunded,
  };
}
