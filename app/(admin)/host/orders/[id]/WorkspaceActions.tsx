"use client";
import { Button } from "@/components/brand/button";

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
  OVERRIDE_KEYS,
  useSharedData,
  type AreaKey,
  type OverrideKey,
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
  const out = { ...fallback };
  for (const k of OVERRIDE_KEYS) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
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
function sharedStateFromSnapshot(snapshot: Record<string, unknown>): SharedState {
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
    clubs: clubsFrom(snapshot.clubs, snapshot.clubName),
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
    loadedOrderIdentity: EMPTY_STATE.loadedOrderIdentity,
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
    bulk({
      ...next,
      currentOrderId: order.id,
      // Remember the order's identity so the documents step can warn if the
      // workspace's organization/date later diverges from it.
      loadedOrderIdentity: `${order.clubName}|${order.eventDate}`,
    });
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
      loadedOrderIdentity: "",
      eventDate: "",
      lastDepositInvoiceNumber: "",
    });
    // Back to step 1, not the documents step: the event date was deliberately
    // cleared, and every document is blocked until a new one is entered.
    router.push("/host");
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        disabled={busy !== null}
        onClick={loadIntoWorkspace}
      >
        {busy === "load" ? "Loading…" : "Load into Workspace"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={duplicateAsNewEvent}
      >
        {busy === "duplicate" ? "Duplicating…" : "Duplicate as New Event"}
      </Button>
    </>
  );
}
