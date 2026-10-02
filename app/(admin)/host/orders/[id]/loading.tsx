"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { deriveSummaryStatus } from "@/lib/host-orders-types";
import {
  getOrderNavigationPreview,
  getServerOrderNavigationPreview,
  subscribeToOrderNavigationPreview,
} from "../order-navigation-preview";
import OrderDetailHeader from "./OrderDetailHeader";

export default function Loading() {
  const params = useParams<{ id: string }>();
  const preview = useSyncExternalStore(
    subscribeToOrderNavigationPreview,
    getOrderNavigationPreview,
    getServerOrderNavigationPreview,
  );
  const order = preview?.id === params.id ? preview : null;

  return (
    <div className="space-y-10" aria-busy="true">
      {order ? (
        <OrderDetailHeader order={order} status={deriveSummaryStatus(order)} actions={
          <>
            <span className="loading-block h-10 w-[180px]" />
            <span className="loading-block h-10 w-[195px]" />
            <span className="loading-block h-10 w-[235px]" />
          </>
        } />
      ) : (
        <div className="space-y-5">
          <div className="loading-block h-5 w-32" />
          <div className="loading-block h-10 w-64 max-w-full" />
          <div className="loading-block h-4 w-40" />
        </div>
      )}
      <section className="card p-6 space-y-5" aria-label="Loading rental documents">
        <div className="loading-block h-6 w-44" />
        <div className="loading-block h-16 w-full" />
        <div className="loading-block h-16 w-full" />
        <div className="loading-block h-16 w-full" />
      </section>
      <section className="card p-6 space-y-5" aria-label="Loading rental ledger">
        <div className="loading-block h-6 w-28" />
        <div className="grid gap-6 sm:grid-cols-4">
          {[0, 1, 2, 3].map(item => <div key={item} className="loading-block h-12" />)}
        </div>
      </section>
    </div>
  );
}
