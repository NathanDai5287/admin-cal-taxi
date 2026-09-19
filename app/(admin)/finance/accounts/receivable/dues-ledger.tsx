"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addDuesPayment,
  bulkDeleteDuesBalances,
  bulkSetDuesPaid,
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
  paymentRequestId: string;
};

type Filter = "outstanding" | "overdue" | "paid" | "all";

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" width="17">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function DeleteBalanceButton({
  disabled,
  label,
  idleText = "Delete balance",
  confirmText = "Confirm delete",
}: {
  disabled?: boolean;
  label: string;
  idleText?: string;
  confirmText?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <Button
      aria-label={armed ? `Confirm permanent deletion of ${label}` : `Delete ${label}`}
      compact
      disabled={disabled}
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      type="submit"
      variant="danger"
    >
      {armed ? confirmText : idleText}
    </Button>
  );
}

export function DuesLedger({
  rows,
  members,
  mode = "view",
}: {
  rows: DuesRow[];
  members: { id: string; name: string }[];
  mode?: "view" | "manage";
}) {
  const canManage = mode === "manage";
  const [optimisticRows, setOptimisticRows] = useState(rows);
  const [optimisticBusy, setOptimisticBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = optimisticRows.find((row) => row.id === editingId) ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOptimisticRows(rows);
      setSelectedIds((current) => current.filter((id) => rows.some((row) => row.id === id)));
      setOptimisticBusy(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rows]);

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
    return optimisticRows.filter((row) => {
      if (filter === "outstanding" && row.isPaid) return false;
      if (filter === "overdue" && !row.isOverdue) return false;
      if (filter === "paid" && !row.isPaid) return false;
      if (!normalizedQuery) return true;
      return [row.memberName, row.notes]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, optimisticRows]);

  const counts: Record<Filter, number> = {
    outstanding: optimisticRows.filter((row) => !row.isPaid).length,
    overdue: optimisticRows.filter((row) => row.isOverdue).length,
    paid: optimisticRows.filter((row) => row.isPaid).length,
    all: optimisticRows.length,
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  }

  function selectVisible() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !filtered.some((row) => row.id === id))
      : [...new Set([...current, ...filtered.map((row) => row.id)])]);
  }

  return (
    <>
    <section className="card" aria-labelledby={`${mode}-dues-ledger-title`}>
      <div className="dues-ledger-toolbar">
        <div>
          <h2 className="card-title" id={`${mode}-dues-ledger-title`}>{canManage ? "Update existing balances" : "Member balances"}</h2>
          <p className="mt-1 text-[13px] text-muted">{canManage ? "Change due dates, record payments, edit details, or remove balances." : "View what members owe and review payment status."}</p>
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

      {canManage && <div className="dues-bulk-toolbar">
        <div className="dues-bulk-selection">
          <strong>{selectedIds.length ? `${selectedIds.length} selected` : "Select balances for bulk changes"}</strong>
          <button disabled={!filtered.length || optimisticBusy} onClick={selectVisible} type="button">
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </button>
          {!!selectedIds.length && <button disabled={optimisticBusy} onClick={() => setSelectedIds([])} type="button">Clear selection</button>}
        </div>
        {!!selectedIds.length && <div className="dues-bulk-actions">
          <form action={bulkSetDuesPaid} onSubmit={() => {
            const selected = new Set(selectedIds);
            setOptimisticBusy(true);
            setOptimisticRows((current) => current.map((row) => selected.has(row.id)
              ? { ...row, amountOwed: 0, paidAmount: row.assessedAmount, isPaid: true, isOverdue: false }
              : row));
            setSelectedIds([]);
          }}>
            {selectedIds.map((id) => <input key={id} name="balanceId" type="hidden" value={id} />)}
            <Button compact disabled={optimisticBusy} type="submit" variant="primary">Clear balances</Button>
          </form>
          <form action={bulkDeleteDuesBalances} onSubmit={() => {
            const selected = new Set(selectedIds);
            setOptimisticBusy(true);
            setOptimisticRows((current) => current.filter((row) => !selected.has(row.id)));
            setSelectedIds([]);
          }}>
            {selectedIds.map((id) => <input key={id} name="balanceId" type="hidden" value={id} />)}
            <DeleteBalanceButton
              disabled={optimisticBusy}
              key={selectedIds.join(",")}
              label={`${selectedIds.length} selected balances`}
              idleText="Delete selected"
              confirmText="Confirm delete"
            />
          </form>
          <small>Clearing marks balances fully paid and keeps their history.</small>
        </div>}
      </div>}

      {filtered.length ? (
        <div className="dues-list">
          {filtered.map((row) => (
            <article className={`dues-row${canManage ? "" : " read-only"}${canManage && selectedIds.includes(row.id) ? " selected" : ""}`} key={row.id}>
              <div className="dues-person">
                {canManage && <input
                  aria-label={`Select ${row.memberName}'s balance`}
                  checked={selectedIds.includes(row.id)}
                  className="dues-select"
                  disabled={optimisticBusy}
                  onChange={() => toggleSelected(row.id)}
                  type="checkbox"
                />}
                <div className="dues-avatar" aria-hidden="true">
                  {row.memberName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3>{row.memberName}</h3>
                  {!row.memberId && <p>Account link needed{canManage ? " — use Edit to select the registered member." : "."}</p>}
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

              {canManage && <div className="dues-actions">
                <form action={setDuesPaid} onSubmit={() => {
                  setOptimisticBusy(true);
                  setOptimisticRows((current) => current.map((candidate) => candidate.id === row.id
                    ? {
                        ...candidate,
                        amountOwed: row.isPaid ? row.assessedAmount : 0,
                        paidAmount: row.isPaid ? 0 : row.assessedAmount,
                        isPaid: !row.isPaid,
                        isOverdue: row.isPaid && row.dueDate < currentPacificDate(),
                      }
                    : candidate));
                }}>
                  <input name="id" type="hidden" value={row.id} />
                  <input name="paid" type="hidden" value={row.isPaid ? "false" : "true"} />
                  <Button compact disabled={optimisticBusy} type="submit" variant={row.isPaid ? "secondary" : "primary"}>
                    {row.isPaid ? "Reopen balance" : "Mark fully paid"}
                  </Button>
                </form>
                <Button compact disabled={optimisticBusy} onClick={() => setEditingId(row.id)} type="button" variant="secondary">Edit charge</Button>
              </div>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state border-t border-rule">
          {optimisticRows.length ? "No balances match this view." : canManage ? "No balances to update." : "No dues balances yet."}
        </div>
      )}
    </section>
    {canManage && editingRow ? (
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
              <h2 id="edit-balance-title">Edit charge for {editingRow.memberName}</h2>
            </div>
            <button aria-label="Close balance editor" onClick={() => setEditingId(null)} type="button">×</button>
          </div>

          <div className="dues-balance-snapshot" aria-label="Balance summary">
            <div><span>Assessed</span><strong>{formatMoney(editingRow.assessedAmount)}</strong></div>
            <div><span>Paid</span><strong>{formatMoney(editingRow.paidAmount)}</strong></div>
            <div><span>Still owed</span><strong>{formatMoney(editingRow.amountOwed)}</strong></div>
          </div>

          {!editingRow.isPaid ? (
            <form action={addDuesPayment} className="dues-payment-form" onSubmit={(event) => {
              const amount = Number(new FormData(event.currentTarget).get("paymentAmount"));
              if (!Number.isFinite(amount) || amount <= 0) return;
              setOptimisticBusy(true);
              setOptimisticRows((current) => current.map((candidate) => {
                if (candidate.id !== editingRow.id) return candidate;
                const paidAmount = Math.min(candidate.assessedAmount, candidate.paidAmount + amount);
                const amountOwed = Math.max(0, candidate.assessedAmount - paidAmount);
                return { ...candidate, paidAmount, amountOwed, isPaid: amountOwed === 0, isOverdue: amountOwed > 0 && candidate.isOverdue };
              }));
            }}>
              <input name="id" type="hidden" value={editingRow.id} />
              <input name="requestId" type="hidden" value={editingRow.paymentRequestId} />
              <div className="field grow">
                <label className="field-label" htmlFor={`payment-${editingRow.id}`}>Add a payment</label>
                <div className="money-input"><span>$</span><input autoFocus className="field-input" id={`payment-${editingRow.id}`} max={editingRow.amountOwed} min="0.01" name="paymentAmount" placeholder="0.00" step="0.01" type="number" required /></div>
              </div>
              <Button disabled={optimisticBusy} type="submit" variant="primary">Apply payment</Button>
            </form>
          ) : (
            <div className="dues-paid-notice">This balance is fully paid.</div>
          )}

          <form action={updateDuesBalance} className="dues-edit-form" id={`edit-balance-${editingRow.id}`} onSubmit={(event) => {
            const form = new FormData(event.currentTarget);
            const amountOwed = Number(form.get("amountOwed"));
            const memberId = String(form.get("memberId") ?? "");
            const memberName = members.find((member) => member.id === memberId)?.name ?? editingRow.memberName;
            const dueDate = String(form.get("dueDate") ?? editingRow.dueDate);
            setOptimisticBusy(true);
            setOptimisticRows((current) => current.map((candidate) => candidate.id === editingRow.id
              ? {
                  ...candidate,
                  memberId,
                  memberName,
                  amountOwed,
                  assessedAmount: candidate.isPaid ? amountOwed : candidate.paidAmount + amountOwed,
                  paidAmount: candidate.isPaid ? amountOwed : candidate.paidAmount,
                  dueDate,
                  notes: String(form.get("notes") ?? ""),
                  isOverdue: !candidate.isPaid && dueDate < currentPacificDate(),
                }
              : candidate));
            setEditingId(null);
          }}>
            <input name="id" type="hidden" value={editingRow.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="field-label" htmlFor={`member-${editingRow.id}`}>Member</label>
                <select className="field-input" defaultValue={editingRow.memberId ?? ""} id={`member-${editingRow.id}`} name="memberId" required>
                  {!editingRow.memberId && <option value="" disabled>Link {editingRow.memberName} to a registered member</option>}
                  {editingRow.memberId && !members.some((member) => member.id === editingRow.memberId) && <option value={editingRow.memberId}>{editingRow.memberName} (archived)</option>}
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
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
              <div className="field sm:col-span-2">
                <label className="field-label" htmlFor={`notes-${editingRow.id}`}>Note</label>
                <input className="field-input" defaultValue={editingRow.notes} id={`notes-${editingRow.id}`} maxLength={500} name="notes" />
              </div>
            </div>
          </form>
          <div className="dues-edit-footer">
            <form action={deleteDuesBalance} onSubmit={() => {
              setOptimisticBusy(true);
              setOptimisticRows((current) => current.filter((candidate) => candidate.id !== editingRow.id));
              setSelectedIds((current) => current.filter((id) => id !== editingRow.id));
              setEditingId(null);
            }}>
              <input name="id" type="hidden" value={editingRow.id} />
              <DeleteBalanceButton disabled={optimisticBusy} label={`${editingRow.memberName}'s balance`} />
            </form>
            <div className="flex gap-2">
              <Button onClick={() => setEditingId(null)} type="button" variant="secondary">Cancel</Button>
              <Button disabled={optimisticBusy} form={`edit-balance-${editingRow.id}`} type="submit" variant="primary">Save changes</Button>
            </div>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
