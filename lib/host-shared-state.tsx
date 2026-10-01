"use client";

/**
 * Shared cross-page state for the Theta Xi rental tools (/host).
 *
 * Backed by localStorage so values survive reloads and new sessions.
 * Hydration runs in a useEffect to avoid SSR / first-paint mismatch —
 * forms can read `hydrated` to decide whether to show their controlled
 * inputs yet.
 *
 * Step ownership: each field is edited on exactly one step of the flow.
 *   1. Event Details (/host)          — clubs, eventDate, numGuests,
 *                                       contacts, maxGuests override
 *   2. Pricing (/host/pricing)        — pricingSelections, finalPrice
 *                                       override, depositAmount override
 *   3. Contract (/host/contract)      — times, monitors, areas, guest list,
 *                                       amenities
 *   4. Documents (/host/documents)    — per-document fields (local state)
 * Later steps show earlier steps' values read-only with a link back, so a
 * number agreed on step 2 can't be quietly changed on step 3.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { effective } from "./host-derive";

const STORAGE_KEY = "admin.host.shared.v1";

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

type Updater = <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;

export type SharedDataApi = {
  /** Hydrated flag — false until localStorage has been read on the client. */
  hydrated: boolean;
  data: SharedState;
  update: Updater;
  bulk: (partial: Partial<SharedState>) => void;
  clear: () => void;
  /** Retire only this order's draft after a successful final save or approval. */
  finishOrder: (orderId: string, savedDraft?: SharedState) => void;
  /** Set a derived field and mark it user-owned, detaching it from its source. */
  setDerived: (key: OverrideKey, value: string) => void;
  /** Re-attach a derived field to its source, discarding the manual value. */
  resetDerived: (key: OverrideKey) => void;
};

const Ctx = createContext<SharedDataApi | null>(null);

function sameClubs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameDraft(a: SharedState, b: SharedState): boolean {
  return (Object.keys(EMPTY_STATE) as (keyof SharedState)[])
    .filter(key => !["currentOrderId", "loadedOrderIdentity", "orderCreateRequestKey", "orderDraftIntent", "overrides"].includes(key))
    // Archived signing forms resolve derived values into explicit strings.
    // Compare the values that were approved, regardless of that representation.
    .every(key => {
      if (!OVERRIDE_KEYS.includes(key as OverrideKey)) {
        return JSON.stringify(a[key]) === JSON.stringify(b[key]);
      }
      const left = effective(a, key as OverrideKey);
      const right = effective(b, key as OverrideKey);
      return left === right || (
        left.trim() !== "" && right.trim() !== "" &&
        Number.isFinite(Number(left)) && Number(left) === Number(right)
      );
    });
}

/**
 * Migrate a stored state written by an older schema:
 *  - `clubName: string` → `clubs: string[]` (multi-org support)
 *  - `overrides.rentalPrice` → `overrides.finalPrice` (the contract fee is
 *    no longer separately overridable; the negotiated price covers it)
 *  - `pricingBreakdown` is dropped — now derived live from numGuests +
 *    pricingSelections, so a stored copy could only be stale.
 */
function migrate(parsed: Record<string, unknown>): SharedState {
  const merged: SharedState = {
    ...EMPTY_STATE,
    ...parsed,
    overrides: { ...EMPTY_STATE.overrides, ...(parsed.overrides ?? {}) },
  } as SharedState;

  // Older browsers retained saved orders as the default Create workspace.
  // Keep any new event edits, but never restore that ambiguous attachment.
  if (merged.currentOrderId && parsed.orderDraftIntent !== "edit" && parsed.orderDraftIntent !== "preview") {
    merged.currentOrderId = "";
    merged.loadedOrderIdentity = "";
    merged.orderCreateRequestKey = "";
    merged.lastDepositInvoiceNumber = "";
    merged.orderDraftIntent = "";
  }

  // clubName → clubs
  if (!Array.isArray(parsed.clubs)) {
    const legacy = typeof parsed.clubName === "string" ? parsed.clubName.trim() : "";
    merged.clubs = legacy ? [legacy] : [];
  } else {
    merged.clubs = (parsed.clubs as unknown[]).filter(
      (c): c is string => typeof c === "string",
    );
  }
  merged.contractSigners = Array.isArray(parsed.contractSigners)
    ? (parsed.contractSigners as ContractSigner[]).filter(s => s && typeof s.id === "string" && typeof s.fullName === "string" && typeof s.email === "string" && typeof s.club === "string")
    : [];

  // overrides.rentalPrice → overrides.finalPrice
  const legacyOverrides = (parsed.overrides ?? {}) as Record<string, unknown>;
  if (
    legacyOverrides.rentalPrice === true &&
    !merged.overrides.finalPrice &&
    typeof parsed.rentalPrice === "string" &&
    parsed.rentalPrice.trim() !== ""
  ) {
    merged.finalPrice = parsed.rentalPrice;
    merged.overrides.finalPrice = true;
  }

  // Drafts written before overrides existed: every non-empty derived field
  // was put there by the old copy-once auto-fill, which never refreshed.
  // Mark them manual so nothing visibly changes on this upgrade — each one
  // then shows a "reset to auto" link the user can take when they want it.
  if (!parsed.overrides) {
    // In that schema the negotiated fee lived in `rentalPrice`; dropping it
    // would silently reprice the rental from the calculator.
    if (
      merged.finalPrice.trim() === "" &&
      typeof parsed.rentalPrice === "string" &&
      parsed.rentalPrice.trim() !== ""
    ) {
      merged.finalPrice = parsed.rentalPrice;
    }
    for (const k of OVERRIDE_KEYS) merged.overrides[k] = merged[k] !== "";
  }

  return merged;
}

function loadFromStorage(): SharedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      // Merge with defaults so any newly-added fields don't read as undefined
      return migrate(parsed as Record<string, unknown>);
    }
  } catch {
    /* ignore corrupt JSON */
  }
  return null;
}

export function SharedDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SharedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  // Once true, any change to `data` writes through to localStorage.
  // Initially false so the empty-state render doesn't clobber stored data.
  const persistEnabled = useRef(false);

  // Hydrate once on the client
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = loadFromStorage();
      if (stored) setData(stored);
      setHydrated(true);
      persistEnabled.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Persist on every change after hydration
  useEffect(() => {
    // clear/finishOrder remove the key synchronously. Do not recreate an empty
    // draft, or remove a different draft another browser tab is working on.
    if (!persistEnabled.current || data === EMPTY_STATE) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* localStorage may be disabled (private browsing); ignore */
    }
  }, [data]);

  // An order may be edited in another tab. Keep an attached Documents
  // workspace in sync before it can prepare a revision with old recipients.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        if (!event.newValue) {
          if (!event.oldValue) return;
          const removed = migrate(JSON.parse(event.oldValue) as Record<string, unknown>);
          setData(current => {
            if (current.currentOrderId !== removed.currentOrderId) return current;
            // A newer edit in this tab has not been finalized. Keep it and
            // persist it again instead of letting an older save erase it.
            return sameDraft(current, removed) ? EMPTY_STATE : { ...current };
          });
          return;
        }
        const next = migrate(JSON.parse(event.newValue) as Record<string, unknown>);
        setData(current => current.currentOrderId && current.currentOrderId === next.currentOrderId && JSON.stringify(current) !== JSON.stringify(next) ? next : current);
      } catch { /* ignore corrupt or unrelated storage writes */ }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update: Updater = useCallback((key, value) => {
    setData(d => {
      const next = { ...d, [key]: value };
      // The deposit invoice number belongs to a specific event: changing who
      // the event is for, or when it is, retires any number minted for it.
      if (key === "eventDate" && value !== d.eventDate) {
        next.lastDepositInvoiceNumber = "";
        if (!d.currentOrderId) next.orderCreateRequestKey = "";
      }
      if (key === "clubs" && !sameClubs(value as string[], d.clubs)) {
        next.lastDepositInvoiceNumber = "";
        if (!d.currentOrderId) next.orderCreateRequestKey = "";
      }
      return next;
    });
  }, []);

  const bulk = useCallback((partial: Partial<SharedState>) => {
    setData(d => {
      const next = { ...d, ...partial };
      const identityChanged =
        (partial.clubs !== undefined && !sameClubs(partial.clubs, d.clubs)) ||
        (partial.eventDate !== undefined && partial.eventDate !== d.eventDate);
      // Same retirement rule as update(), but an explicit value in the same
      // bulk write wins — loading an order sets identity and its invoice
      // number together.
      if (identityChanged && partial.lastDepositInvoiceNumber === undefined) {
        next.lastDepositInvoiceNumber = "";
      }
      if (identityChanged && !d.currentOrderId && partial.orderCreateRequestKey === undefined) {
        next.orderCreateRequestKey = "";
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setData(EMPTY_STATE);
  }, []);

  const finishOrder = useCallback((orderId: string, savedDraft?: SharedState) => {
    if (!orderId) return;
    const matches = (draft: SharedState) => savedDraft
      ? sameDraft(draft, savedDraft) && (draft.currentOrderId === orderId || draft.currentOrderId === savedDraft.currentOrderId)
      : draft.currentOrderId === orderId;
    const stored = loadFromStorage();
    if (stored && matches(stored)) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
    }
    setData(current => matches(current) ? EMPTY_STATE : current);
  }, []);

  const setDerived = useCallback((key: OverrideKey, value: string) => {
    setData(d => ({ ...d, [key]: value, overrides: { ...d.overrides, [key]: true } }));
  }, []);

  const resetDerived = useCallback((key: OverrideKey) => {
    setData(d => ({ ...d, [key]: "", overrides: { ...d.overrides, [key]: false } }));
  }, []);

  const api = useMemo<SharedDataApi>(
    () => ({ hydrated, data, update, bulk, clear, finishOrder, setDerived, resetDerived }),
    [hydrated, data, update, bulk, clear, finishOrder, setDerived, resetDerived],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSharedData(): SharedDataApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSharedData must be used inside a <SharedDataProvider>");
  }
  return ctx;
}
