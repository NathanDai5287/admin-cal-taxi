"use client";

import { useState } from "react";
import SigningPanel from "../../documents/SigningPanel";
import { updateOrderAction } from "../actions";
import { EMPTY_STATE, type SharedState } from "@/lib/host-shared-state";
import type { Order } from "@/lib/host-orders-types";

function signingDraft(order: Order): SharedState {
  const saved = order.snapshot as Partial<SharedState>;
  const contract = order.documents.find(document => document.kind === "contract");
  const clubs = Array.isArray(saved.clubs) && saved.clubs.every(club => typeof club === "string")
    ? saved.clubs : [order.clubName];
  return {
    ...EMPTY_STATE,
    ...saved,
    clubs,
    contractSigners: Array.isArray(saved.contractSigners) ? saved.contractSigners : [],
    contractPresign: typeof saved.contractPresign === "boolean" ? saved.contractPresign : contract?.payload.sign === true,
    eventDate: order.eventDate,
    finalPrice: String(order.rentalPrice ?? saved.finalPrice ?? ""),
    depositAmount: String(order.depositAmount ?? saved.depositAmount ?? ""),
    overrides: { ...EMPTY_STATE.overrides, ...saved.overrides, finalPrice: true, depositAmount: true },
    currentOrderId: order.id,
  };
}

export default function OrderSigning({ order }: { order: Order }) {
  const [data, setData] = useState<SharedState>(() => signingDraft(order));

  function update<K extends keyof SharedState>(key: K, value: SharedState[K]) {
    setData(previous => ({ ...previous, [key]: value }));
  }

  async function saveOrder(): Promise<string | null> {
    const result = await updateOrderAction(order.id, {
      snapshot: { ...order.snapshot, ...data, currentOrderId: order.id },
    });
    if (!result.ok) throw new Error(result.error);
    return order.id;
  }

  return <SigningPanel data={data} update={update} orderId={order.id} saveOrder={saveOrder} showPresignControl />;
}
