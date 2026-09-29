"use client";

import { useSyncExternalStore } from "react";

import {
  getPayableNavigationPreview,
  getServerPayableNavigationPreview,
  subscribeToPayableNavigationPreview,
} from "@/components/reimbursements/payable-navigation-preview";

export function PayableReceiptPlaceholder({ id }: { id: string }) {
  const preview = useSyncExternalStore(
    subscribeToPayableNavigationPreview,
    getPayableNavigationPreview,
    getServerPayableNavigationPreview,
  );
  const selected = preview?.id === id ? preview : null;

  return (
    <div className="receipt-image-wrap border-t border-rule" aria-busy="true">
      {selected?.receiptUrl ? (
        // The table has already fetched and decoded this signed image URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`Receipt submitted by ${selected.name}`} className="receipt-preview" decoding="async" fetchPriority="high" src={selected.receiptUrl} />
      ) : <span aria-hidden="true" className="loading-block block h-[360px] w-full" />}
    </div>
  );
}
