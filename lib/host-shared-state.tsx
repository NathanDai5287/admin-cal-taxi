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

export * from "./host-state-model";
import { EMPTY_STATE, OVERRIDE_KEYS, type SharedState, type OverrideKey } from "./host-state-model";
import { activeDraft, draftKey, readDraft, retireDraft, beginDraft, draftOrderVersion, HOST_DRAFT_SELECTED_EVENT } from "./host-draft-storage";
import { usePathname } from "next/navigation";

type Updater = <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;

export type SharedDataApi = {
  /** Hydrated flag — false until localStorage has been read on the client. */
  hydrated: boolean;
  draftId: string;
  isCurrent: (approved?: SharedState) => boolean;
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

function sameDraft(a: SharedState, b: SharedState): boolean {
  return (Object.keys(EMPTY_STATE) as (keyof SharedState)[])
    .filter(key => !["currentOrderId", "loadedOrderIdentity", "orderCreateRequestKey", "orderDraftIntent", "overrides", "documentContextId"].includes(key))
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

/** Orders never enter this context. Every Create session has an immutable owner. */
export function HostWorkspaceBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const creating = ["/host", "/host/pricing", "/host/contract", "/host/documents", "/host/invoice"].includes(pathname);
  return <SharedDataProvider renderWithoutScope={!creating}>{children}</SharedDataProvider>;
}

function DraftLoading() {
  return (
    <div aria-busy="true" aria-label="Opening saved rental draft" className="space-y-6">
      <div className="loading-block h-4 w-48" />
      <div className="loading-block h-9 w-64 max-w-full" />
      <section className="card p-6 space-y-5">
        <div className="loading-block h-5 w-36" />
        <div className="loading-block h-10 w-full max-w-xl" />
        <div className="loading-block h-10 w-full max-w-xl" />
      </section>
    </div>
  );
}

export function SharedDataProvider({ children, renderWithoutScope = false }: { children: React.ReactNode; renderWithoutScope?: boolean }) {
  const [scope, setScope] = useState<{ id: string; data: SharedState } | null>(null);
  const switchScope = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    async function claim(id: string) {
      const data = readDraft(id) ?? structuredClone(EMPTY_STATE);
      if (!navigator.locks) {
        const isolated = beginDraft({ ...data, orderCreateRequestKey: "" }, draftOrderVersion(id));
        if (!disposed) setScope({ id: isolated, data: readDraft(isolated)! });
        return;
      }
      await navigator.locks.request(`host-draft:${id}`, { ifAvailable: true }, async lock => {
        if (disposed) return;
        if (!lock) {
          const isolated = beginDraft({ ...data, orderCreateRequestKey: "" }, draftOrderVersion(id));
          void claim(isolated);
          return;
        }
        setScope({ id, data });
        await new Promise<void>(resolve => { release = resolve; if (disposed) resolve(); });
      });
    }
    switchScope.current = id => { setScope(null); release?.(); void claim(id); };
    const onDraftSelected = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === "string" && id) switchScope.current(id);
    };
    window.addEventListener(HOST_DRAFT_SELECTED_EVENT, onDraftSelected);
    void claim(activeDraft());
    return () => { disposed = true; window.removeEventListener(HOST_DRAFT_SELECTED_EVENT, onDraftSelected); release?.(); };
  }, []);
  if (!scope) return renderWithoutScope ? children : <DraftLoading />;
  return <DraftProvider key={scope.id} id={scope.id} initial={scope.data} replace={next => switchScope.current(next.id)}>{children}</DraftProvider>;
}

function DraftProvider({ id, initial, replace, children }: {
  id: string; initial: SharedState;
  replace: (scope: { id: string; data: SharedState }) => void;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initial);
  const current = useRef(data);
  useEffect(() => { current.current = data; }, [data]);
  const alive = useRef(true);
  const retired = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (retired.current) return;
    try { localStorage.setItem(draftKey(id), JSON.stringify(data)); } catch { /* unavailable storage */ }
  }, [id, data]);
  const bulk = useCallback((partial: Partial<SharedState>) => {
    if (!alive.current || retired.current) return;
    setData(previous => ({ ...previous, ...structuredClone(partial) }));
  }, []);
  const update: Updater = useCallback((key, value) => {
    if (!alive.current || retired.current) return;
    setData(previous => ({ ...previous, [key]: structuredClone(value),
      ...((key === "clubs" || key === "eventDate") ? { lastDepositInvoiceNumber: "" } : {}),
    }));
  }, []);
  const clear = useCallback(() => {
    retired.current = true;
    retireDraft(id);
    const nextId = beginDraft(structuredClone(EMPTY_STATE));
    replace({ id: nextId, data: readDraft(nextId)! });
  }, [id, replace]);
  const finishOrder = useCallback((orderId: string, savedDraft?: SharedState) => {
    if (!alive.current || retired.current || !orderId) return;
    if (savedDraft && !sameDraft(current.current, savedDraft)) return;
    if (!savedDraft && current.current.currentOrderId !== orderId) return;
    retired.current = true;
    retireDraft(id);
    const nextId = beginDraft(structuredClone(EMPTY_STATE));
    replace({ id: nextId, data: readDraft(nextId)! });
  }, [id, replace]);
  const setDerived = useCallback((key: OverrideKey, value: string) => {
    if (!alive.current || retired.current) return;
    setData(previous => ({ ...previous, [key]: value, overrides: { ...previous.overrides, [key]: true } }));
  }, []);
  const resetDerived = useCallback((key: OverrideKey) => {
    if (!alive.current || retired.current) return;
    setData(previous => ({ ...previous, [key]: "", overrides: { ...previous.overrides, [key]: false } }));
  }, []);
  const isCurrent = useCallback((approved?: SharedState) => alive.current && !retired.current && (!approved || sameDraft(current.current, approved)), []);
  const api = useMemo<SharedDataApi>(() => ({ hydrated: true, draftId: id, data, update, bulk, clear, finishOrder, setDerived, resetDerived, isCurrent }),
    [id, data, update, bulk, clear, finishOrder, setDerived, resetDerived, isCurrent]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSharedData(): SharedDataApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Create draft context is unavailable on this page");
  return ctx;
}
