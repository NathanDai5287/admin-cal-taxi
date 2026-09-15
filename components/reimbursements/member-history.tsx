"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import {
  memberHistoryFilters,
  type MemberHistoryFilter,
  type MemberHistoryRow,
} from "@/lib/reimbursements/member-history";
import { memberPaymentStatus, memberStatus, memberSubmissionDate } from "@/lib/reimbursements/member-status";

const pageSize = 20;

function isFilter(value: string | null): value is MemberHistoryFilter {
  return memberHistoryFilters.some(([key]) => key === value);
}

function rowMatchesFilter(row: MemberHistoryRow, filter: MemberHistoryFilter) {
  if (filter === "progress") {
    return !row.reimbursed && ["pending", "verified", "mismatch", "processing_failed"].includes(row.status);
  }
  if (filter === "approved") return row.status === "approved" && !row.reimbursed;
  if (filter === "paid") return row.reimbursed;
  if (filter === "denied") return row.status === "denied";
  return true;
}

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const rawFilter = params.get("filter");
  const filter = isFilter(rawFilter) ? rawFilter : "all";
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { filter, page };
}

export function MemberHistory({ rows, initialFilter, initialPage }: {
  rows: MemberHistoryRow[];
  initialFilter: MemberHistoryFilter;
  initialPage: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(initialFilter);
  const [page, setPage] = useState(initialPage);
  const filteredRows = useMemo(() => rows.filter(row => rowMatchesFilter(row, filter)), [rows, filter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    function restoreFromHistory() {
      const next = readLocation();
      setFilter(next.filter);
      setPage(next.page);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  useEffect(() => {
    if (!rows.some((row) => row.status === "pending")) return;
    const interval = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [router, rows]);

  function updateView(nextFilter: MemberHistoryFilter, nextPage = 1) {
    setFilter(nextFilter);
    setPage(nextPage);
    const params = new URLSearchParams();
    if (nextFilter !== "all") params.set("filter", nextFilter);
    if (nextPage !== 1) params.set("page", String(nextPage));
    window.history.pushState(null, "", `/history${params.size ? `?${params}` : ""}`);
  }

  return (
    <>
      <div className="history-toolbar">
        <nav aria-label="Filter reimbursements" className="history-filters">
          {memberHistoryFilters.map(([key, label]) => (
            <button key={key} type="button" onClick={() => updateView(key)} aria-current={key === filter ? "page" : undefined}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      {visibleRows.length ? (
        <section aria-label="Submitted reimbursements" className="history-ledger">
          <div className="history-columns" aria-hidden="true"><span>Expense / submitted</span><span>Review / payment</span><span>Amount</span></div>
          <ul>
            {visibleRows.map(row => <li key={row.id}>
              <Link href={`/history/${row.id}`} className="history-row">
                <div className="history-expense"><h2>{row.description}</h2><p>{formatCategory(row.category)} <span aria-hidden="true">·</span> {memberSubmissionDate(row.submitted_at)}</p></div>
                <div className="history-status"><span data-status={row.status}>{memberStatus(row.status).label}</span><small data-paid={row.reimbursed}>{memberPaymentStatus(row.status, row.reimbursed)}</small></div>
                <div className="history-amount">{formatMoney(row.amount)}</div>
              </Link>
            </li>)}
          </ul>
        </section>
      ) : (
        <section className="history-empty">
          <h2 className="font-semibold">{filter === "all" ? "No reimbursements yet" : "No reimbursements to show"}</h2>
          <p className="mt-2 text-sm text-muted">{filter === "all" ? "Your submitted expenses and their statuses will appear here." : "Try another filter."}</p>
          {filter === "all" ? <Link href="/" className="mt-4 inline-block text-sm text-brand underline">Submit your first reimbursement</Link> : <button type="button" onClick={() => updateView("all")} className="mt-4 text-sm text-brand underline">View all reimbursements</button>}
        </section>
      )}
      {!!filteredRows.length && <nav aria-label="History pages" className="mt-5 flex items-center justify-between text-sm">
        {currentPage > 1 ? <button type="button" onClick={() => updateView(filter, currentPage - 1)} className="text-brand">← Previous</button> : <span />}
        <span className="text-muted">Page {currentPage} · {filteredRows.length} requests</span>
        {currentPage < pageCount ? <button type="button" onClick={() => updateView(filter, currentPage + 1)} className="text-brand">Next →</button> : <span />}
      </nav>}
    </>
  );
}
