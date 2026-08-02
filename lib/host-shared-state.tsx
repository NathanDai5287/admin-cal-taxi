"use client";

/**
 * Shared cross-page state for the Theta Xi rental tools (/host).
 *
 * Backed by localStorage so values survive reloads and new sessions.
 * Hydration runs in a useEffect to avoid SSR / first-paint mismatch —
 * forms can read `hydrated` to decide whether to show their controlled
 * inputs yet.
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

const STORAGE_KEY = "admin.host.shared.v1";

export type AreaKey = "living_room" | "dining_room" | "backyard";

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
 * Fields that are normally derived from an earlier step. Each has an entry in
 * `SharedState.overrides`; while that flag is false the stored string is
 * ignored and the value is recomputed live (see lib/host-derive.ts).
 */
export type OverrideKey = "finalPrice" | "rentalPrice" | "depositAmount" | "maxGuests";

export const OVERRIDE_KEYS: OverrideKey[] = [
  "finalPrice", "rentalPrice", "depositAmount", "maxGuests",
];

export type SharedState = {
  // Identity — shared across every page
  clubName: string;
  eventDate: string;
  numGuests: string;

  // Contract draft (so /host/contract restores after reload)
  startTime: string;
  endTime: string;
  rentalPrice: string;
  depositAmount: string;
  maxGuests: string;
  monitors: string;
  areas: Record<AreaKey, boolean>;
  cleared: Record<AreaKey, boolean>;
  guestList: boolean;
  soundSystem: boolean;
  lightingSystem: boolean;
  // (sign is not persisted — always defaults to false on each visit)

  // Pricing — written by /host/pricing, read by /host/invoice
  pricingBreakdown: PricingBreakdown | null;
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

  // Cross-references between invoice tabs
  lastDepositInvoiceNumber: string;

  /**
   * The archived order this workspace is currently attached to, or "" when the
   * workspace is a new unsaved rental. Set by "Save to Orders" and by loading
   * an order back in; documents generated afterwards attach to it.
   */
  currentOrderId: string;

  // Officers — rendered on invoices and the credit memo. Optional;
  // empty values fall back to the generic "Theta Xi treasurer" wording.
  treasurerName: string;
  treasurerContact: string;
  presidentName: string;
  presidentContact: string;
};

export const EMPTY_STATE: SharedState = {
  clubName: "",
  eventDate: "",
  numGuests: "",

  startTime: "",
  endTime: "",
  rentalPrice: "",
  depositAmount: "",
  maxGuests: "",
  monitors: "",
  areas: { living_room: false, dining_room: false, backyard: false },
  cleared: { living_room: false, dining_room: false, backyard: false },
  guestList: false,
  soundSystem: false,
  lightingSystem: false,

  pricingBreakdown: null,
  pricingSelections: {
    alcohol: 1, protection: 1, date: 1,
    setup: 0, cleanup: 0, wealth: 1, relationship: 1,
  },
  finalPrice: "",
  overrides: {
    finalPrice: false, rentalPrice: false, depositAmount: false, maxGuests: false,
  },

  lastDepositInvoiceNumber: "",
  currentOrderId: "",

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
  /** Set a derived field and mark it user-owned, detaching it from its source. */
  setDerived: (key: OverrideKey, value: string) => void;
  /** Re-attach a derived field to its source, discarding the manual value. */
  resetDerived: (key: OverrideKey) => void;
};

const Ctx = createContext<SharedDataApi | null>(null);

/** Required numeric keys on a fully-populated PricingBreakdown. If any are
 *  missing on a stored breakdown, the schema has changed since it was
 *  written and we drop it so the calculator can re-derive a valid one. */
const BREAKDOWN_REQUIRED_KEYS: (keyof PricingBreakdown)[] = [
  "base", "capacity", "firePermit", "alcohol", "protection", "date", "setup", "cleanup",
  "subtotal", "wealthMult", "postW", "relR", "adj", "total", "contingencyPrice",
  "suggestedDeposit", "depositRate",
  "guests", "capacityThreshold", "perGuestRate",
];

function isValidBreakdown(b: unknown): b is PricingBreakdown {
  if (!b || typeof b !== "object") return false;
  const obj = b as Record<string, unknown>;
  return BREAKDOWN_REQUIRED_KEYS.every(k => typeof obj[k] === "number");
}

function loadFromStorage(): SharedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      // Merge with defaults so any newly-added fields don't read as undefined
      const merged: SharedState = {
        ...EMPTY_STATE,
        ...parsed,
        overrides: { ...EMPTY_STATE.overrides, ...(parsed.overrides ?? {}) },
      };
      // Drop stale breakdowns whose schema predates current fields.
      if (merged.pricingBreakdown && !isValidBreakdown(merged.pricingBreakdown)) {
        merged.pricingBreakdown = null;
      }
      // Drafts written before overrides existed: every non-empty derived field
      // was put there by the old copy-once auto-fill, which never refreshed.
      // Mark them manual so nothing visibly changes on this upgrade — each one
      // then shows a "reset to auto" link the user can take when they want it.
      if (!parsed.overrides) {
        for (const k of OVERRIDE_KEYS) merged.overrides[k] = merged[k] !== "";
      }
      return merged;
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
    if (!persistEnabled.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* localStorage may be disabled (private browsing); ignore */
    }
  }, [data]);

  const update: Updater = useCallback((key, value) => {
    setData(d => ({ ...d, [key]: value }));
  }, []);

  const bulk = useCallback((partial: Partial<SharedState>) => {
    setData(d => ({ ...d, ...partial }));
  }, []);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setData(EMPTY_STATE);
  }, []);

  const setDerived = useCallback((key: OverrideKey, value: string) => {
    setData(d => ({ ...d, [key]: value, overrides: { ...d.overrides, [key]: true } }));
  }, []);

  const resetDerived = useCallback((key: OverrideKey) => {
    setData(d => ({ ...d, [key]: "", overrides: { ...d.overrides, [key]: false } }));
  }, []);

  const api = useMemo<SharedDataApi>(
    () => ({ hydrated, data, update, bulk, clear, setDerived, resetDerived }),
    [hydrated, data, update, bulk, clear, setDerived, resetDerived],
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
