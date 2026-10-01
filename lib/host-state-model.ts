export type AreaKey = "living_room" | "dining_room" | "backyard";

export type ContractSigner = { id: string; fullName: string; email: string; club: string };

/**
 * The computed pricing breakdown. Never stored in this state — it is a pure
 * function of (numGuests, pricingSelections), recomputed live wherever it's
 * needed (see lib/host-pricing.ts). It IS embedded into order snapshots at
 * save time, as a historical record for the archive's order detail page.
 */
export type PricingBreakdown = {
  base: number;
  capacity: number;
  firePermit: number;
  alcohol: number;
  protection: number;
  date: number;
  setup: number;
  cleanup: number;
  subtotal: number;
  wealthMult: number;
  wealthLabel: string;
  postW: number;
  relR: number;
  relLabel: string;
  adj: number;
  total: number;
  contingencyPrice: number;
  // Suggested deposit + the rate it was derived from (so the contract
  // can show "auto-filled at 25%").
  suggestedDeposit: number;
  depositRate: number;
  // Tier labels for human-readable line-item descriptions on the rental invoice
  alcoholLabel: string;
  protectionLabel: string;
  dateLabel: string;
  setupLabel: string;
  cleanupLabel: string;
  // Capacity context: guests entered, included threshold, per-guest rate
  guests: number;
  capacityThreshold: number;
  perGuestRate: number;
};

export type PricingSelections = {
  alcohol: number;
  protection: number;
  date: number;
  setup: number;
  cleanup: number;
  wealth: number;
  relationship: number;
};

/**
 * Fields that are normally derived from an earlier input. Each has an entry
 * in `SharedState.overrides`; while that flag is false the stored string is
 * ignored and the value is recomputed live (see lib/host-derive.ts).
 *
 * Each override is edited on the step that owns its source:
 *   finalPrice    — pricing step (source: the calculator total)
 *   depositAmount — pricing step (source: the calculator's suggestion)
 *   maxGuests     — event details step (source: numGuests)
 */
export type OverrideKey = "finalPrice" | "depositAmount" | "maxGuests";

export const OVERRIDE_KEYS: OverrideKey[] = [
  "finalPrice", "depositAmount", "maxGuests",
];

export type SharedState = {
  documentContextId: string;
  // Identity — shared across every page. One entry per organization; a
  // multi-org event lists them all ("Club 1", "Club 2", … on the contract).
  clubs: string[];
  contractSigners: ContractSigner[];
  chapterSignerName: string;
  chapterSignerEmail: string;
  contractPresign: boolean;
  eventDate: string;
  numGuests: string;

  // Contract draft (so /host/contract restores after reload)
  startTime: string;
  endTime: string;
  depositAmount: string;
  maxGuests: string;
  monitors: string;
  areas: Record<AreaKey, boolean>;
  cleared: Record<AreaKey, boolean>;
  guestList: boolean;
  soundSystem: boolean;
  lightingSystem: boolean;
  // Contract signer details and the chapter presigning choice are persisted.

  // Pricing — owned by /host/pricing
  pricingSelections: PricingSelections;
  /** Negotiated total. Only meaningful when overrides.finalPrice is true;
   *  otherwise the calculator total is used. */
  finalPrice: string;

  /**
   * Which derived fields the user has taken manual control of. A false flag
   * means "keep following the earlier step" — the stored string for that key
   * is ignored, so the field can never hold a stale copy of a value that has
   * since changed upstream.
   */
  overrides: Record<OverrideKey, boolean>;

  // Cross-references between invoice tabs. Cleared automatically when the
  // event identity (clubs or date) changes — a number minted for one event
  // must not leak onto another event's credit memo.
  lastDepositInvoiceNumber: string;

  /**
   * The archived order this workspace is currently attached to, or "" when the
   * workspace is a new unsaved rental. Set by "Save to Orders" and by loading
   * an order back in; documents generated afterwards attach to it.
   */
  currentOrderId: string;
  orderCreateRequestKey: string;
  /** Only explicit order editing or an unfinished signing preview may restore an attachment. */
  orderDraftIntent: "" | "edit" | "preview";

  /**
   * Identity ("clubName|eventDate") of the attached order at the moment it
   * was loaded or first saved. The documents step compares this against the
   * live identity to warn before an Update rewrites the order's organization
   * or date in place. "" when unattached or saved before this field existed.
   */
  loadedOrderIdentity: string;

  // Officers — rendered on invoices and the credit memo. Optional;
  // empty values fall back to the generic "Theta Xi treasurer" wording.
  treasurerName: string;
  treasurerContact: string;
  presidentName: string;
  presidentContact: string;
};

export const EMPTY_STATE: SharedState = {
  documentContextId: "",
  clubs: [],
  contractSigners: [],
  chapterSignerName: "",
  chapterSignerEmail: "",
  contractPresign: false,
  eventDate: "",
  numGuests: "",

  startTime: "",
  endTime: "",
  depositAmount: "",
  maxGuests: "",
  monitors: "",
  areas: { living_room: false, dining_room: false, backyard: false },
  cleared: { living_room: false, dining_room: false, backyard: false },
  guestList: false,
  soundSystem: false,
  lightingSystem: false,

  pricingSelections: {
    alcohol: 1, protection: 1, date: 1,
    setup: 0, cleanup: 0, wealth: 1, relationship: 1,
  },
  finalPrice: "",
  overrides: {
    finalPrice: false, depositAmount: false, maxGuests: false,
  },

  lastDepositInvoiceNumber: "",
  currentOrderId: "",
  orderCreateRequestKey: "",
  orderDraftIntent: "",
  loadedOrderIdentity: "",

  treasurerName: "",
  treasurerContact: "",
  presidentName: "",
  presidentContact: "",
};


function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function areaRecord(v: unknown, fallback: Record<AreaKey, boolean>): Record<AreaKey, boolean> {
  if (!v || typeof v !== "object") return { ...fallback };
  const o = v as Record<string, unknown>;
  const keys: AreaKey[] = ["living_room", "dining_room", "backyard"];
  const out = { ...fallback };
  for (const k of keys) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}
function overridesRecord(
  v: unknown,
  fallback: Record<OverrideKey, boolean>,
): Record<OverrideKey, boolean> {
  if (!v || typeof v !== "object") return { ...fallback };
  const o = v as Record<string, unknown>;
  const out = { ...fallback };
  for (const k of OVERRIDE_KEYS) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}
function pricingSelectionsFrom(v: unknown, fallback: PricingSelections): PricingSelections {
  if (!v || typeof v !== "object") return { ...fallback };
  const o = v as Record<string, unknown>;
  const keys: (keyof PricingSelections)[] = [
    "alcohol", "protection", "date", "setup", "cleanup", "wealth", "relationship",
  ];
  const out = { ...fallback };
  for (const k of keys) if (typeof o[k] === "number" && Number.isInteger(o[k]) && Number(o[k]) >= 0 && Number(o[k]) <= 10) out[k] = o[k] as number;
  return out;
}

/** Organizations list from a snapshot: `clubs` (current schema), or the
 *  legacy single `clubName` string wrapped in a list. */
function clubsFrom(v: unknown, legacyClubName: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((c): c is string => typeof c === "string");
  }
  const single = str(legacyClubName, "").trim();
  return single ? [single] : [];
}

/** Build a full SharedState from an order snapshot. Every field not present
 *  or wrong-shaped falls back to EMPTY_STATE rather than surfacing undefined
 *  or a malformed value downstream. `currentOrderId` is deliberately left at
 *  its empty default — callers set it explicitly after this returns.
 *
 *  The snapshot's `pricingBreakdown` is deliberately NOT loaded: the live
 *  workspace derives pricing from numGuests + pricingSelections, so a stored
 *  copy could only disagree with them. (It stays in the archive for the
 *  order detail page's historical display.) */
export function sharedStateFromSnapshot(snapshot: Record<string, unknown>): SharedState {
  const overrides = overridesRecord(snapshot.overrides, EMPTY_STATE.overrides);

  // Legacy schema: the contract fee was separately overridable. It isn't
  // anymore — the negotiated price covers it — so an old rentalPrice
  // override becomes a finalPrice override of the same value.
  let finalPrice = str(snapshot.finalPrice, EMPTY_STATE.finalPrice);
  const legacyOverrides = (snapshot.overrides ?? {}) as Record<string, unknown>;
  if (
    legacyOverrides.rentalPrice === true &&
    !overrides.finalPrice &&
    str(snapshot.rentalPrice, "").trim() !== ""
  ) {
    finalPrice = str(snapshot.rentalPrice, "");
    overrides.finalPrice = true;
  }
  // Pre-overrides snapshots: the resolved rentalPrice was the negotiated
  // price. Preserve it as a finalPrice override so loading an old archived
  // order doesn't silently reprice it from the calculator.
  if (
    !snapshot.overrides &&
    !overrides.finalPrice &&
    str(snapshot.rentalPrice, "").trim() !== ""
  ) {
    finalPrice = str(snapshot.rentalPrice, "");
    overrides.finalPrice = true;
  }

  return {
    documentContextId: str(snapshot.documentContextId, ""),
    clubs: clubsFrom(snapshot.clubs, snapshot.clubName),
    contractSigners: Array.isArray(snapshot.contractSigners)
      ? snapshot.contractSigners.filter((s): s is SharedState["contractSigners"][number] => Boolean(s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string" && typeof (s as { fullName?: unknown }).fullName === "string" && typeof (s as { email?: unknown }).email === "string" && typeof (s as { club?: unknown }).club === "string"))
      : [],
    chapterSignerName: str(snapshot.chapterSignerName, ""),
    chapterSignerEmail: str(snapshot.chapterSignerEmail, ""),
    contractPresign: bool(snapshot.contractPresign, false),
    eventDate: str(snapshot.eventDate, EMPTY_STATE.eventDate),
    numGuests: str(snapshot.numGuests, EMPTY_STATE.numGuests),
    startTime: str(snapshot.startTime, EMPTY_STATE.startTime),
    endTime: str(snapshot.endTime, EMPTY_STATE.endTime),
    depositAmount: str(snapshot.depositAmount, EMPTY_STATE.depositAmount),
    maxGuests: str(snapshot.maxGuests, EMPTY_STATE.maxGuests),
    monitors: str(snapshot.monitors, EMPTY_STATE.monitors),
    areas: areaRecord(snapshot.areas, EMPTY_STATE.areas),
    cleared: areaRecord(snapshot.cleared, EMPTY_STATE.cleared),
    guestList: bool(snapshot.guestList, EMPTY_STATE.guestList),
    soundSystem: bool(snapshot.soundSystem, EMPTY_STATE.soundSystem),
    lightingSystem: bool(snapshot.lightingSystem, EMPTY_STATE.lightingSystem),
    pricingSelections: pricingSelectionsFrom(snapshot.pricingSelections, EMPTY_STATE.pricingSelections),
    finalPrice,
    overrides,
    lastDepositInvoiceNumber: str(snapshot.lastDepositInvoiceNumber, EMPTY_STATE.lastDepositInvoiceNumber),
    currentOrderId: EMPTY_STATE.currentOrderId,
    orderDraftIntent: EMPTY_STATE.orderDraftIntent,
    orderCreateRequestKey: EMPTY_STATE.orderCreateRequestKey,
    loadedOrderIdentity: EMPTY_STATE.loadedOrderIdentity,
    treasurerName: str(snapshot.treasurerName, EMPTY_STATE.treasurerName),
    treasurerContact: str(snapshot.treasurerContact, EMPTY_STATE.treasurerContact),
    presidentName: str(snapshot.presidentName, EMPTY_STATE.presidentName),
    presidentContact: str(snapshot.presidentContact, EMPTY_STATE.presidentContact),
  };
}
