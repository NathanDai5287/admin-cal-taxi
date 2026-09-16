"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { type MemberHistoryRow } from "@/lib/reimbursements/member-history";
import { memberPaymentStatus, memberStatus, memberSubmissionDate } from "@/lib/reimbursements/member-status";

const pageSize = 20;

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return page;
}

export function MemberHistory({ rows, initialPage }: {
  rows: MemberHistoryRow[];
  initialPage: number;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalRequested = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const paidRows = rows.filter((row) => row.reimbursed);
  const totalPaid = paidRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const openCount = rows.filter((row) => row.status !== "denied" && !row.reimbursed).length;

  useEffect(() => {
    function restoreFromHistory() {
      setPage(readLocation());
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  useEffect(() => {
    if (!rows.some((row) => row.status === "pending")) return;
    const interval = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(interval);
  }, [router, rows]);

  function updatePage(nextPage: number) {
    setPage(nextPage);
    const params = new URLSearchParams();
    if (nextPage !== 1) params.set("page", String(nextPage));
    window.history.pushState(null, "", `/history${params.size ? `?${params}` : ""}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {!!rows.length && <dl className="history-summary" aria-label="Reimbursement overview">
        <div><dt>Requests</dt><dd>{rows.length}</dd></div>
        <div><dt>Total requested</dt><dd>{formatMoney(totalRequested)}</dd></div>
        <div><dt>Paid</dt><dd>{formatMoney(totalPaid)} <small>{paidRows.length} {paidRows.length === 1 ? "request" : "requests"}</small></dd></div>
        <div><dt>In progress</dt><dd>{openCount}</dd></div>
      </dl>}
      {visibleRows.length ? (
        <section aria-label="Submitted reimbursements" className="history-ledger">
          <div className="history-columns" aria-hidden="true"><span>Expense</span><span>Submitted</span><span>Status</span><span>Amount</span></div>
          <ul>
            {visibleRows.map(row => <li key={row.id}>
              <Link href={`/history/${row.id}`} className="history-row">
                <div className="history-expense"><h2>{row.description}</h2><p>{formatCategory(row.category)} <span aria-hidden="true">·</span> {row.payment_method}</p></div>
                <time className="history-date" dateTime={row.submitted_at}>{memberSubmissionDate(row.submitted_at)}</time>
                <div className="history-status">
                  <span className="history-state" data-status={row.status}>{memberStatus(row.status).label}</span>
                  <small className="history-payment" data-paid={row.reimbursed} data-awaiting={row.status === "approved" && !row.reimbursed}>{memberPaymentStatus(row.status, row.reimbursed)}</small>
                </div>
                <div className="history-amount"><span>{formatMoney(row.amount)}</span><span className="history-arrow" aria-hidden="true">→</span></div>
              </Link>
            </li>)}
          </ul>
        </section>
      ) : (
        <section className="history-empty">
          <h2 className="font-semibold">No reimbursements yet</h2>
          <p className="mt-2 text-sm text-muted">Your submitted expenses and their statuses will appear here.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-brand underline">Submit your first reimbursement</Link>
        </section>
      )}
      {!!rows.length && <nav aria-label="History pages" className="mt-5 flex items-center justify-between text-sm">
        {currentPage > 1 ? <button type="button" onClick={() => updatePage(currentPage - 1)} className="text-brand">← Previous</button> : <span />}
        <span className="text-muted">Page {currentPage} of {pageCount} · {rows.length} requests</span>
        {currentPage < pageCount ? <button type="button" onClick={() => updatePage(currentPage + 1)} className="text-brand">Next →</button> : <span />}
      </nav>}
    </>
  );
}
