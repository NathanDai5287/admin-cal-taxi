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

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order } from "@/lib/host-orders-types";
import {
  type SharedState,
} from "@/lib/host-shared-state";

// ─── Defensive snapshot → SharedState ───────────────────────────────────────

export default function WorkspaceActions({
  order,
  loadLabel = "Load into Workspace",
  showDuplicate = true,
  compact = false,
}: {
  order: Order;
  loadLabel?: string;
  showDuplicate?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"load" | "duplicate" | null>(null);

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
      "Load this order into the workspace? This replaces whatever is currently in " +
      "Pricing, Contract, and Documents with this order's saved details.",
    );
    if (!ok) return;
    setBusy("load");
    const next = stateFromOrder();
    beginDraft({
      ...next,
      currentOrderId: order.id,
      orderDraftIntent: "edit",
      // Remember the order's identity so the documents step can warn if the
      // workspace's organization/date later diverges from it.
      loadedOrderIdentity: `${order.clubName}|${order.eventDate}`,
    }, order.updatedAt);
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
    const next = stateFromOrder();
    beginDraft({
      ...next,
      currentOrderId: "",
      orderDraftIntent: "",
      loadedOrderIdentity: "",
      contractSigners: [],
      chapterSignerName: "",
      chapterSignerEmail: "",
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
        {busy === "duplicate" ? "Duplicating…" : "Duplicate as New Event"}
      </Button>}
    </>
  );
}
