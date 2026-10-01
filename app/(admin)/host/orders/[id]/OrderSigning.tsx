"use client";

import { useRef, useState } from "react";
import SigningPanel from "../../documents/SigningPanel";
import { getOrderAction, updateOrderAction } from "../actions";
import { EMPTY_STATE, type SharedState } from "@/lib/host-shared-state";
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
  const [stale, setStale] = useState(false);
  const version = useRef(order.updatedAt);
  const savedSnapshot = useRef(JSON.stringify(order.snapshot));

  async function checkFresh() {
    if (stale) throw new Error("This order changed in another tab. Reload it before preparing or sending a contract.");
    const latest = await getOrderAction(order.id);
    if (!latest.ok) throw new Error(latest.error);
    if (latest.data.updatedAt !== version.current || JSON.stringify(latest.data.snapshot) !== savedSnapshot.current) {
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
      expectedUpdatedAt: version.current,
      snapshot: { ...order.snapshot, contractSigners: data.contractSigners, chapterSignerName: data.chapterSignerName, chapterSignerEmail: data.chapterSignerEmail, contractPresign: data.contractPresign },
    });
    if (!result.ok) throw new Error(result.error);
    savedSnapshot.current = JSON.stringify(result.data.snapshot);
    version.current = result.data.updatedAt;
    return order.id;
  }

  if (stale) return <div className="bg-canvas/40 px-5 py-5">
    <p className="text-[13px] text-warn">This order changed elsewhere. Reload the page to review its latest terms and signing links.</p>
    <button type="button" className="mt-3 text-[13px] underline" onClick={() => window.location.reload()}>Reload order</button>
  </div>;

  return <SigningPanel data={data} update={update} orderId={order.id} saveOrder={saveOrder} showPresignControl beforeSigningAction={checkFresh} />;
}
