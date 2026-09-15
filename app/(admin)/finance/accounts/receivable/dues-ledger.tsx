"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDuesPayment,
  deleteDuesBalance,
  setDuesPaid,
  updateDuesBalance,
} from "@/app/(admin)/finance/accounts/receivable/actions";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";

export type DuesRow = {
  id: string;
  memberId: string | null;
  memberName: string;
  amountOwed: number;
  assessedAmount: number;
  paidAmount: number;
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

function DeleteBalanceButton({ id, memberName }: { id: string; memberName: string }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <Button
      aria-label={armed ? `Confirm permanent deletion of ${memberName}'s balance` : `Delete ${memberName}'s balance`}
      compact
      formAction={deleteDuesBalance}
      name="id"
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      type="submit"
      value={id}
      variant="danger"
    >
      {armed ? "Confirm delete" : "Delete balance"}
    </Button>
  );
}

export function DuesLedger({ rows, members }: { rows: DuesRow[]; members: { id: string; name: string; email: string }[] }) {
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = rows.find((row) => row.id === editingId) ?? null;

  useEffect(() => {
    if (!editingRow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditingId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingRow]);

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
    <>
    <section className="card" aria-labelledby="dues-ledger-title">
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
                  {!row.memberId && <p>Account link needed — use Edit to select the registered member.</p>}
                  <p>
                    Due {formatDate(row.dueDate)}
                    {row.isOverdue ? <span className="dues-overdue-label">Overdue</span> : null}
                    {row.isPaid ? <span className="dues-paid-label">Paid</span> : null}
                    {row.discordUserId ? <span className="dues-discord-linked">Discord linked</span> : null}
                  </p>
                  {row.paidAmount > 0 && !row.isPaid ? (
                    <p>Paid {formatMoney(row.paidAmount)} of {formatMoney(row.assessedAmount)}</p>
                  ) : null}
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
                <Button compact onClick={() => setEditingId(row.id)} type="button" variant="secondary">Edit</Button>
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
    {editingRow ? (
      <div
        className="dues-dialog-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditingId(null);
        }}
        role="presentation"
      >
        <section aria-labelledby="edit-balance-title" aria-modal="true" className="dues-balance-dialog" role="dialog">
          <div className="dues-dialog-header">
            <div>
              <p className="page-eyebrow">Member balance</p>
              <h2 id="edit-balance-title">Edit {editingRow.memberName}</h2>
            </div>
            <button aria-label="Close balance editor" onClick={() => setEditingId(null)} type="button">×</button>
          </div>

          <div className="dues-balance-snapshot" aria-label="Balance summary">
            <div><span>Assessed</span><strong>{formatMoney(editingRow.assessedAmount)}</strong></div>
            <div><span>Paid</span><strong>{formatMoney(editingRow.paidAmount)}</strong></div>
            <div><span>Still owed</span><strong>{formatMoney(editingRow.amountOwed)}</strong></div>
          </div>

          {!editingRow.isPaid ? (
            <form action={addDuesPayment} className="dues-payment-form">
              <input name="id" type="hidden" value={editingRow.id} />
              <div className="field grow">
                <label className="field-label" htmlFor={`payment-${editingRow.id}`}>Add a payment</label>
                <div className="money-input"><span>$</span><input autoFocus className="field-input" id={`payment-${editingRow.id}`} max={editingRow.amountOwed} min="0.01" name="paymentAmount" placeholder="0.00" step="0.01" type="number" required /></div>
              </div>
              <Button type="submit" variant="primary">Apply payment</Button>
            </form>
          ) : (
            <div className="dues-paid-notice">This balance is fully paid.</div>
          )}

          <form action={updateDuesBalance} className="dues-edit-form">
            <input name="id" type="hidden" value={editingRow.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="field-label" htmlFor={`member-${editingRow.id}`}>Member</label>
                <select className="field-input" defaultValue={editingRow.memberId ?? ""} id={`member-${editingRow.id}`} name="memberId" required>
                  {!editingRow.memberId && <option value="" disabled>Link {editingRow.memberName} to a registered member</option>}
                  {editingRow.memberId && !members.some((member) => member.id === editingRow.memberId) && <option value={editingRow.memberId}>{editingRow.memberName} (archived)</option>}
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`amount-${editingRow.id}`}>{editingRow.isPaid ? "Original amount" : "Amount still owed"}</label>
                <div className="money-input"><span>$</span><input className="field-input" defaultValue={editingRow.isPaid ? editingRow.assessedAmount : editingRow.amountOwed} id={`amount-${editingRow.id}`} min="0.01" name="amountOwed" step="0.01" type="number" required /></div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`due-${editingRow.id}`}>Due date</label>
                <input className="field-input" defaultValue={editingRow.dueDate} id={`due-${editingRow.id}`} name="dueDate" type="date" required />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`discord-${editingRow.id}`}>Discord member ID</label>
                <input
                  className="field-input"
                  defaultValue={editingRow.discordUserId}
                  id={`discord-${editingRow.id}`}
                  inputMode="numeric"
                  maxLength={25}
                  name="discordUserId"
                  pattern="(?:[0-9]{15,22}|<@!?[0-9]{15,22}>)"
                  placeholder="Optional numeric ID"
                  title="Enter a 15–22 digit Discord user ID or paste a Discord mention"
                />
              </div>
              <div className="field sm:col-span-2">
                <label className="field-label" htmlFor={`notes-${editingRow.id}`}>Note</label>
                <input className="field-input" defaultValue={editingRow.notes} id={`notes-${editingRow.id}`} maxLength={500} name="notes" />
              </div>
            </div>
            <div className="dues-edit-footer">
              <DeleteBalanceButton id={editingRow.id} memberName={editingRow.memberName} />
              <div className="flex gap-2">
                <Button onClick={() => setEditingId(null)} type="button" variant="secondary">Cancel</Button>
                <Button type="submit" variant="primary">Save changes</Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    ) : null}
    </>
  );
}
