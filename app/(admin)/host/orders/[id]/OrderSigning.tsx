"use client";

import { useEffect, useRef, useState } from "react";
import SigningPanel from "../../documents/SigningPanel";
import { getOrderAction, updateOrderAction } from "../actions";
import { EMPTY_STATE, useSharedData, type SharedState } from "@/lib/host-shared-state";
import type { Order } from "@/lib/host-orders-types";
import { sharedStateFromSnapshot } from "./WorkspaceActions";

function signingDraft(order: Order): SharedState {
  const saved = sharedStateFromSnapshot(order.snapshot);
  const contract = order.documents.find(document => document.kind === "contract");
  return {
    ...saved,
    clubs: saved.clubs.length ? saved.clubs : [order.clubName],
    contractPresign: typeof order.snapshot.contractPresign === "boolean" ? saved.contractPresign : contract?.payload.sign === true,
    eventDate: order.eventDate,
    finalPrice: String(order.rentalPrice ?? saved.finalPrice ?? ""),
    depositAmount: String(order.depositAmount ?? saved.depositAmount ?? ""),
    overrides: { ...EMPTY_STATE.overrides, ...saved.overrides, finalPrice: true, depositAmount: true },
    currentOrderId: order.id,
  };
}

export default function OrderSigning({ order }: { order: Order }) {
  const [data, setData] = useState<SharedState>(() => signingDraft(order));
  const { data: workspace, bulk } = useSharedData();
  const [stale, setStale] = useState(false);
  const savedSnapshot = useRef(JSON.stringify(order.snapshot));

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "admin.host.shared.v1" || !event.newValue) return;
      try {
        const changed = JSON.parse(event.newValue) as { currentOrderId?: string };
        if (changed.currentOrderId === order.id) setStale(true);
      } catch { /* ignore invalid storage */ }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [order.id]);

  async function checkFresh() {
    if (stale) throw new Error("This order changed in another tab. Reload it before preparing or sending a contract.");
    const latest = await getOrderAction(order.id);
    if (!latest.ok) throw new Error(latest.error);
    if (JSON.stringify(latest.data.snapshot) !== savedSnapshot.current) {
      setStale(true);
      throw new Error("This order changed elsewhere. Reload it before preparing or sending a contract.");
    }
  }

  function update<K extends keyof SharedState>(key: K, value: SharedState[K]) {
    setData(previous => ({ ...previous, [key]: value }));
  }

  async function saveOrder(): Promise<string | null> {
    await checkFresh();
    const result = await updateOrderAction(order.id, {
      snapshot: { ...order.snapshot, ...data, currentOrderId: order.id },
    });
    if (!result.ok) throw new Error(result.error);
    savedSnapshot.current = JSON.stringify(result.data.snapshot);
    // Keep the Documents workspace current when it is attached to this order.
    // The provider persists this update, including across open browser tabs.
    if (workspace.currentOrderId === order.id) bulk({ ...data, currentOrderId: order.id });
    return order.id;
  }

  if (stale) return <div className="border-t border-border px-5 py-6 sm:px-8">
    <p className="text-[13px] text-warn">This order changed elsewhere. Reload the page to review its latest terms and signing links.</p>
    <button type="button" className="mt-3 text-[13px] underline" onClick={() => window.location.reload()}>Reload order</button>
  </div>;

  return <SigningPanel data={data} update={update} orderId={order.id} saveOrder={saveOrder} showPresignControl beforeSigningAction={checkFresh} />;
}
