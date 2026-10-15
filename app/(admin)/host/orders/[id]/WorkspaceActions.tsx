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

import { beginDraft } from "@/lib/host-draft-storage";
import { sharedStateFromSnapshot } from "@/lib/host-state-model";
export { sharedStateFromSnapshot } from "@/lib/host-state-model";

import { useState } from "react";
import type { Order } from "@/lib/host-orders-types";
import {
  type SharedState,
} from "@/lib/host-shared-state";

// ─── Defensive snapshot → SharedState ───────────────────────────────────────

export default function WorkspaceActions({
  order,
  loadLabel = "Edit order",
  showDuplicate = true,
  compact = false,
  variant = "secondary",
}: {
  order: Order;
  loadLabel?: string;
  showDuplicate?: boolean;
  compact?: boolean;
  variant?: "primary" | "secondary";
}) {
  const [busy, setBusy] = useState<"load" | "duplicate" | null>(null);
  const [error, setError] = useState("");

  function openWorkspace(data: SharedState, action: "load" | "duplicate", orderVersion?: string) {
    setError("");
    setBusy(action);
    try {
      beginDraft(data, orderVersion);
    } catch {
      setBusy(null);
      setError("Could not save the editing draft in this browser. Check that browser storage is available, then try again.");
      return;
    }
    window.location.assign("/host");
  }

  function stateFromOrder(): SharedState {
    const next = sharedStateFromSnapshot(order.snapshot);
    next.documentContextId = next.documentContextId || order.id;
    next.eventDate = order.eventDate;
    next.finalPrice = String(order.rentalPrice ?? "");
    next.depositAmount = String(order.depositAmount ?? "");
    next.overrides = { ...next.overrides, finalPrice: true, depositAmount: true };
    if (order.snapshot.contractPresign === undefined) {
      const contract = order.documents.find(document => document.kind === "contract");
      next.contractPresign = contract?.payload.sign === true;
    }
    return next;
  }

  function loadIntoWorkspace() {
    const ok = window.confirm(
      "Edit this order in a separate draft? Changes are saved only when you select Save changes or approve new signing links. Existing signing links stay active during preview.",
    );
    if (!ok) return;
    const next = stateFromOrder();
    openWorkspace({
      ...next,
      currentOrderId: order.id,
      orderDraftIntent: "edit",
      loadedOrderIdentity: `${order.clubName}|${order.eventDate}`,
    }, "load", order.updatedAt);
  }

  function duplicateAsNewEvent() {
    const ok = window.confirm(
      "Duplicate this order as a new event? Pricing and event details are copied over, " +
      "but the event date, order link, and invoice numbering all start fresh so this " +
      "generates as a brand-new rental rather than appending to the original.",
    );
    if (!ok) return;
    const next = stateFromOrder();
    openWorkspace({
      ...next,
      currentOrderId: "",
      rentalPaymentTiming: "day_before",
      orderDraftIntent: "",
      loadedOrderIdentity: "",
      contractSigners: [],
      chapterSignerName: "",
      chapterSignerEmail: "",
      eventDate: "",
      lastDepositInvoiceNumber: "",
    }, "duplicate");
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        compact={compact}
        disabled={busy !== null}
        onClick={loadIntoWorkspace}
      >
        {busy === "load" ? "Loading…" : loadLabel}
      </Button>
      {showDuplicate && <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={duplicateAsNewEvent}
      >
        {busy === "duplicate" ? "Duplicating…" : "Duplicate event"}
      </Button>}
      {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
    </>
  );
}
