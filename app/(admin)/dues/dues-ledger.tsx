"use client";

import { useMemo, useState } from "react";

import {
  deleteDuesBalance,
  setDuesPaid,
  updateDuesBalance,
} from "@/app/(admin)/dues/actions";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";

export type DuesRow = {
  id: string;
  memberName: string;
  amountOwed: number;
  assessedAmount: number;
  dueDate: string;
  notes: string;
  discordUserId: string;
  isPaid: boolean;
  isOverdue: boolean;
};

type Filter = "outstanding" | "overdue" | "paid" | "all";

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" width="17">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function DuesLedger({ rows }: { rows: DuesRow[] }) {
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "outstanding" && row.isPaid) return false;
      if (filter === "overdue" && !row.isOverdue) return false;
      if (filter === "paid" && !row.isPaid) return false;
      if (!normalizedQuery) return true;
      return [row.memberName, row.notes]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  const counts: Record<Filter, number> = {
    outstanding: rows.filter((row) => !row.isPaid).length,
    overdue: rows.filter((row) => row.isOverdue).length,
    paid: rows.filter((row) => row.isPaid).length,
    all: rows.length,
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="dues-ledger-title">
      <div className="dues-ledger-toolbar">
        <div>
          <h2 className="card-title" id="dues-ledger-title">Member balances</h2>
          <p className="mt-1 text-[13px] text-muted">Track what is still owed and settle balances as payments arrive.</p>
        </div>
        <label className="dues-search">
          <span className="sr-only">Search member balances</span>
          <SearchIcon />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="dues-filter-bar" role="group" aria-label="Filter member balances">
        {(["outstanding", "overdue", "paid", "all"] as const).map((value) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            <span className="capitalize">{value}</span>
            <span className="dues-filter-count">{counts[value]}</span>
          </button>
        ))}
      </div>

      {filtered.length ? (
        <div className="dues-list">
          {filtered.map((row) => (
            <article className="dues-row" key={row.id}>
              <div className="dues-person">
                <div className="dues-avatar" aria-hidden="true">
                  {row.memberName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3>{row.memberName}</h3>
                  <p>
                    Due {formatDate(row.dueDate)}
                    {row.isOverdue ? <span className="dues-overdue-label">Overdue</span> : null}
                    {row.isPaid ? <span className="dues-paid-label">Paid</span> : null}
                    {row.discordUserId ? <span className="dues-discord-linked">Discord linked</span> : null}
                  </p>
                </div>
              </div>

              <div className="dues-balance">
                <span>{row.isPaid ? "Settled" : "Amount owed"}</span>
                <strong>{formatMoney(row.isPaid ? row.assessedAmount : row.amountOwed)}</strong>
              </div>

              <div className="dues-actions">
                <form action={setDuesPaid}>
                  <input name="id" type="hidden" value={row.id} />
                  <input name="paid" type="hidden" value={row.isPaid ? "false" : "true"} />
                  <Button compact type="submit" variant={row.isPaid ? "secondary" : "primary"}>
                    {row.isPaid ? "Reopen" : "Mark paid"}
                  </Button>
                </form>
                <details className="dues-edit">
                  <summary>Edit</summary>
                  <div className="dues-edit-panel">
                    <form action={updateDuesBalance} className="grid gap-4">
                      <input name="id" type="hidden" value={row.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="field">
                          <label className="field-label" htmlFor={`member-${row.id}`}>Member</label>
                          <input className="field-input" defaultValue={row.memberName} id={`member-${row.id}`} maxLength={120} name="memberName" required />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor={`amount-${row.id}`}>Amount owed</label>
                          <div className="money-input"><span>$</span><input className="field-input" defaultValue={row.isPaid ? row.assessedAmount : row.amountOwed} id={`amount-${row.id}`} min="0.01" name="amountOwed" step="0.01" type="number" required /></div>
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor={`due-${row.id}`}>Due date</label>
                          <input className="field-input" defaultValue={row.dueDate} id={`due-${row.id}`} name="dueDate" type="date" required />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor={`discord-${row.id}`}>Discord member ID</label>
                          <input className="field-input" defaultValue={row.discordUserId} id={`discord-${row.id}`} inputMode="numeric" maxLength={25} name="discordUserId" placeholder="Paste ID or mention" />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor={`notes-${row.id}`}>Note</label>
                          <input className="field-input" defaultValue={row.notes} id={`notes-${row.id}`} maxLength={500} name="notes" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-rule pt-4">
                        <Button compact type="submit" variant="primary">Save changes</Button>
                        <Button compact formAction={deleteDuesBalance} name="id" type="submit" value={row.id} variant="danger">Remove</Button>
                      </div>
                    </form>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state border-t border-rule">
          {rows.length ? "No balances match this view." : "No dues balances yet. Add the first member above."}
        </div>
      )}
    </section>
  );
}
