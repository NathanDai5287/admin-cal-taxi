"use client";

/**
 * "Load into workspace" and "Duplicate as new event" — the two ways an
 * archived order feeds back into the live /host flow, both built on
 * useSharedData().bulk().
 *
 * order.snapshot is `Record<string, unknown>`: a full SharedState captured
 * at save time, but loosely typed because SharedState evolves and old
 * snapshots must still load without crashing. Every field below is read
 * individually and type-checked against EMPTY_STATE's shape rather than
 * spread in blind — a stale or malformed snapshot degrades to defaults
 * field-by-field instead of corrupting the whole workspace.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order } from "@/lib/host-orders-types";
import {
  EMPTY_STATE,
  useSharedData,
  type AreaKey,
  type OverrideKey,
  type PricingBreakdown,
  type PricingSelections,
  type SharedState,
} from "@/lib/host-shared-state";

// ─── Defensive snapshot → SharedState ───────────────────────────────────────

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function areaRecord(v: unknown, fallback: Record<AreaKey, boolean>): Record<AreaKey, boolean> {
  if (!v || typeof v !== "object") return fallback;
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
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  const keys: OverrideKey[] = ["finalPrice", "rentalPrice", "depositAmount", "maxGuests"];
  const out = { ...fallback };
  for (const k of keys) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}
function pricingSelectionsFrom(v: unknown, fallback: PricingSelections): PricingSelections {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  const keys: (keyof PricingSelections)[] = [
    "alcohol", "protection", "date", "setup", "cleanup", "wealth", "relationship",
  ];
  const out = { ...fallback };
  for (const k of keys) if (typeof o[k] === "number") out[k] = o[k] as number;
  return out;
}

const BREAKDOWN_NUMBER_KEYS: (keyof PricingBreakdown)[] = [
  "base", "capacity", "firePermit", "alcohol", "protection", "date", "setup", "cleanup",
  "subtotal", "wealthMult", "postW", "relR", "adj", "total", "contingencyPrice",
  "suggestedDeposit", "depositRate", "guests", "capacityThreshold", "perGuestRate",
];

/** Null when the snapshot's breakdown is missing any numeric field the
 *  calculator depends on — same "drop rather than guess" rule the live
 *  workspace applies to a stale localStorage breakdown. */
function pricingBreakdownFrom(v: unknown): PricingBreakdown | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!BREAKDOWN_NUMBER_KEYS.every(k => typeof o[k] === "number")) return null;
  const num = (k: keyof PricingBreakdown) => o[k] as number;
  const label = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return {
    base: num("base"), capacity: num("capacity"), firePermit: num("firePermit"),
    alcohol: num("alcohol"), protection: num("protection"), date: num("date"),
    setup: num("setup"), cleanup: num("cleanup"), subtotal: num("subtotal"),
    wealthMult: num("wealthMult"), wealthLabel: label("wealthLabel"),
    postW: num("postW"), relR: num("relR"), relLabel: label("relLabel"),
    adj: num("adj"), total: num("total"), contingencyPrice: num("contingencyPrice"),
    suggestedDeposit: num("suggestedDeposit"), depositRate: num("depositRate"),
    alcoholLabel: label("alcoholLabel"), protectionLabel: label("protectionLabel"),
    dateLabel: label("dateLabel"), setupLabel: label("setupLabel"), cleanupLabel: label("cleanupLabel"),
    guests: num("guests"), capacityThreshold: num("capacityThreshold"), perGuestRate: num("perGuestRate"),
  };
}

/** Build a full SharedState from an order snapshot. Every field not present
 *  or wrong-shaped falls back to EMPTY_STATE rather than surfacing undefined
 *  or a malformed value downstream. `currentOrderId` is deliberately left at
 *  its empty default — callers set it explicitly after this returns. */
function sharedStateFromSnapshot(snapshot: Record<string, unknown>): SharedState {
  return {
    clubName: str(snapshot.clubName, EMPTY_STATE.clubName),
    eventDate: str(snapshot.eventDate, EMPTY_STATE.eventDate),
    numGuests: str(snapshot.numGuests, EMPTY_STATE.numGuests),
    startTime: str(snapshot.startTime, EMPTY_STATE.startTime),
    endTime: str(snapshot.endTime, EMPTY_STATE.endTime),
    rentalPrice: str(snapshot.rentalPrice, EMPTY_STATE.rentalPrice),
    depositAmount: str(snapshot.depositAmount, EMPTY_STATE.depositAmount),
    maxGuests: str(snapshot.maxGuests, EMPTY_STATE.maxGuests),
    monitors: str(snapshot.monitors, EMPTY_STATE.monitors),
    areas: areaRecord(snapshot.areas, EMPTY_STATE.areas),
    cleared: areaRecord(snapshot.cleared, EMPTY_STATE.cleared),
    guestList: bool(snapshot.guestList, EMPTY_STATE.guestList),
    soundSystem: bool(snapshot.soundSystem, EMPTY_STATE.soundSystem),
    lightingSystem: bool(snapshot.lightingSystem, EMPTY_STATE.lightingSystem),
    pricingBreakdown: pricingBreakdownFrom(snapshot.pricingBreakdown),
    pricingSelections: pricingSelectionsFrom(snapshot.pricingSelections, EMPTY_STATE.pricingSelections),
    finalPrice: str(snapshot.finalPrice, EMPTY_STATE.finalPrice),
    overrides: overridesRecord(snapshot.overrides, EMPTY_STATE.overrides),
    lastDepositInvoiceNumber: str(snapshot.lastDepositInvoiceNumber, EMPTY_STATE.lastDepositInvoiceNumber),
    currentOrderId: EMPTY_STATE.currentOrderId,
    treasurerName: str(snapshot.treasurerName, EMPTY_STATE.treasurerName),
    treasurerContact: str(snapshot.treasurerContact, EMPTY_STATE.treasurerContact),
    presidentName: str(snapshot.presidentName, EMPTY_STATE.presidentName),
    presidentContact: str(snapshot.presidentContact, EMPTY_STATE.presidentContact),
  };
}

export default function WorkspaceActions({ order }: { order: Order }) {
  const { bulk } = useSharedData();
  const router = useRouter();
  const [busy, setBusy] = useState<"load" | "duplicate" | null>(null);

  function loadIntoWorkspace() {
    const ok = window.confirm(
      "Load this order into the workspace? This replaces whatever is currently in " +
      "Pricing, Contract, and Documents with this order's saved details.",
    );
    if (!ok) return;
    setBusy("load");
    const next = sharedStateFromSnapshot(order.snapshot);
    bulk({ ...next, currentOrderId: order.id });
    router.push("/host/documents");
  }

  function duplicateAsNewEvent() {
    const ok = window.confirm(
      "Duplicate this order as a new event? Pricing and contract terms are copied over, " +
      "but the event date, order link, and invoice numbering all start fresh so this " +
      "generates as a brand-new rental rather than appending to the original.",
    );
    if (!ok) return;
    setBusy("duplicate");
    const next = sharedStateFromSnapshot(order.snapshot);
    bulk({
      ...next,
      currentOrderId: "",
      eventDate: "",
      lastDepositInvoiceNumber: "",
    });
    router.push("/host/documents");
  }

  return (
    <>
      <button
        type="button"
        className="btn-primary"
        disabled={busy !== null}
        onClick={loadIntoWorkspace}
      >
        {busy === "load" ? "Loading…" : "Load into Workspace"}
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy !== null}
        onClick={duplicateAsNewEvent}
      >
        {busy === "duplicate" ? "Duplicating…" : "Duplicate as New Event"}
      </button>
    </>
  );
}
