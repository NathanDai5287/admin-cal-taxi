"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { PayableReceiptPlaceholder } from "@/components/reimbursements/payable-receipt-placeholder";
import {
  getPayableNavigationPreview,
  getServerPayableNavigationPreview,
  subscribeToPayableNavigationPreview,
} from "@/components/reimbursements/payable-navigation-preview";

export function PayableDetailLoading() {
  const { id } = useParams<{ id: string }>();
  const preview = useSyncExternalStore(
    subscribeToPayableNavigationPreview,
    getPayableNavigationPreview,
    getServerPayableNavigationPreview,
  );
  const selected = preview?.id === id ? preview : null;

  return (
    <div aria-label="Loading reimbursement details" aria-busy="true">
      <div className="mb-6">
        <p className="page-eyebrow">Submission review</p>
        <h1 className="page-title">{selected?.name ?? "Loading reimbursement…"}</h1>
        {selected && <p className="page-lede">{selected.expense} · {selected.amount}</p>}
      </div>
      <div className="review-grid">
        <div className="review-details">
          <section aria-label="Loading submission details" className="card">
            <div className="card-header"><span className="card-title">Submission details</span></div>
            <div aria-hidden="true" className="card-body grid gap-4">
              <span className="loading-block block h-[30px] w-[55%]" />
              <span className="loading-block block h-[22px] w-[75%]" />
              <span className="loading-block block h-[22px] w-[62%]" />
              <span className="loading-block block h-[22px] w-[85%]" />
            </div>
          </section>
        </div>
        <aside className="receipt-sidebar">
          <section className="card">
            <div className="card-header"><span className="card-title">Submitted receipt</span></div>
            <PayableReceiptPlaceholder id={id} />
          </section>
        </aside>
      </div>
    </div>
  );
}
