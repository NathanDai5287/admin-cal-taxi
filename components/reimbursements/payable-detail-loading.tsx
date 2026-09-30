"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/brand/button";
import { PayableDetailView } from "@/components/reimbursements/payable-detail-view";
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

  if (selected) return <PayableDetailView detail={selected} />;

  return (
    <div aria-label="Loading reimbursement details" aria-busy="true">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <p className="page-eyebrow">Submission review</p>
          <h1 className="page-title">Loading reimbursement…</h1>
        </div>
        <Link className="back-link" href="/finance/accounts/payable">← All reimbursements</Link>
      </div>
      <div className="review-grid">
        <div className="review-details">
          <section aria-label="Loading submission details" className="card">
            <div className="card-header"><span className="card-title">Submission details</span></div>
            <dl className="detail-list border-t border-rule">
              <div><dt>Requested amount</dt><dd className="amount"><span aria-hidden="true" className="loading-block block h-5 w-20" /></dd></div>
              <div><dt>Tabscanner total</dt><dd className="amount"><span aria-hidden="true" className="loading-block block h-5 w-20" /></dd></div>
              <div><dt>Category</dt><dd><span className="inline-flex items-center gap-2 flex-wrap"><span aria-hidden="true" className="loading-block block h-4 w-28" /><Button disabled variant="text" type="button">Change</Button></span></dd></div>
              <div><dt>Receipt date</dt><dd><span aria-hidden="true" className="loading-block block h-4 w-24" /></dd></div>
              <div className="detail-wide"><dt>Expense</dt><dd><span className="inline-flex items-center gap-2 flex-wrap"><span aria-hidden="true" className="loading-block block h-4 w-44" /><Button disabled variant="text" type="button">Rename</Button></span></dd></div>
              <div className="detail-wide"><dt>Description</dt><dd><span aria-hidden="true" className="loading-block block h-4 w-56" /></dd></div>
              <div className="detail-wide"><dt>Zelle phone number or email</dt><dd><span aria-hidden="true" className="loading-block block h-4 w-48" /></dd></div>
            </dl>
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
