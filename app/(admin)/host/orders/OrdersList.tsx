"use client";

/**
 * Search/filter + grouped rendering for the order archive. Kept client-side
 * (unlike the page itself) so filtering is instant and needs no round trip —
 * the server component above already did the one fetch that matters.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { DOCUMENT_META, DOCUMENT_ORDER } from "@/lib/host-documents";
import { formatDateISO } from "@/lib/host-format";
import {
  STATUS_LABELS,
  deriveSummaryStatus,
  type DocumentKind,
  type OrderStatus,
  type OrderSummary,
} from "@/lib/host-orders-types";
import { fmtUSDOrDash, yearOf } from "./order-format";
import StatusPill from "./StatusPill";

const STATUS_FILTERS: (OrderStatus | "all")[] = [
  "all", "draft", "contracted", "invoiced", "completed", "cancelled",
];

/** Single-letter marker for the document strip on each row. */
const DOC_ABBR: Record<DocumentKind, string> = {
  contract: "C",
  deposit_invoice: "D",
  rental_invoice: "R",
  credit_memo: "M",
};

export default function OrdersList({ orders }: { orders: OrderSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(o => {
      if (q && !o.clubName.toLowerCase().includes(q)) return false;
      if (status !== "all" && deriveSummaryStatus(o) !== status) return false;
      return true;
    });
  }, [orders, query, status]);

  // Reverse-chronological by event date, then bucketed by year. Iterating a
  // sorted array into a Map means each year's first appearance is already in
  // the right order, so the groups come out descending without a second sort.
  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    const byYear = new Map<string, OrderSummary[]>();
    for (const o of sorted) {
      const y = yearOf(o.eventDate);
      const list = byYear.get(y);
      if (list) list.push(o);
      else byYear.set(y, [o]);
    }
    return [...byYear.entries()];
  }, [filtered]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="field-label" htmlFor="orders-search">Search</label>
          <input
            id="orders-search"
            className="field-input"
            placeholder="Filter by organization…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="min-w-[190px]">
          <label className="field-label" htmlFor="orders-status">Status</label>
          <select
            id="orders-status"
            className="field-input"
            value={status}
            onChange={e => setStatus(e.target.value as OrderStatus | "all")}
          >
            {STATUS_FILTERS.map(s => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <p className="text-[12px] text-muted pb-2.5">
          {filtered.length} of {orders.length} order{orders.length === 1 ? "" : "s"}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-muted py-10 text-center">No orders match your filters.</p>
      ) : (
        groups.map(([year, group]) => (
          <section key={year}>
            <h2 className="text-[13px] font-bold tracking-[0.14em] uppercase text-muted border-b border-rule pb-2 mb-3">
              {year}
            </h2>
            <div className="space-y-2">
              {group.map(o => <OrderRow key={o.id} order={o} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const status = deriveSummaryStatus(order);
  const have = new Set(order.documentKinds);

  return (
    <Link
      href={`/host/orders/${order.id}`}
      className="card-plain flex items-center gap-5 px-5 py-4 flex-wrap hover:border-brand transition-colors"
    >
      <div className="min-w-[180px] flex-1">
        <p className="text-[14px] font-bold text-ink">{order.clubName || "(no organization)"}</p>
        <p className="text-[12px] text-muted mt-0.5">
          {formatDateISO(order.eventDate) || "No event date"}
        </p>
      </div>

      <StatusPill status={status} />

      <div className="text-right min-w-[100px]">
        <p className="text-[13.5px] tabular-nums text-ink">{fmtUSDOrDash(order.rentalPrice)}</p>
        <p className="text-[11px] text-muted">rental price</p>
      </div>

      <div className="flex items-center gap-1.5 min-w-[150px] justify-end">
        {DOCUMENT_ORDER.map(kind => (
          <span
            key={kind}
            title={`${DOCUMENT_META[kind].label} — ${have.has(kind) ? "issued" : "not issued"}`}
            className={
              "inline-flex items-center justify-center w-[20px] h-[20px] text-[10px] font-bold border shrink-0 " +
              (have.has(kind)
                ? "bg-action text-white border-action"
                : "bg-surface text-muted border-rule")
            }
          >
            {DOC_ABBR[kind]}
          </span>
        ))}
        <span className="text-[11px] text-muted ml-1 whitespace-nowrap">
          {order.documentCount} doc{order.documentCount === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
