"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  bulkUpdateDuesBalances,
  bulkWaiveDuesBalances,
  bulkSetDuesPaid,
  setDuesPaid,
  type DuesActionState,
} from "@/app/(admin)/finance/accounts/receivable/actions";
import { useDuesRows } from "@/app/(admin)/finance/accounts/receivable/dues-board";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";

type Filter = "outstanding" | "overdue" | "paid" | "all";
const initialDuesActionState = { status: "idle" as const, message: "", sequence: 0 };

function latestActionState(...states: DuesActionState[]) {
  return states.reduce((latest, state) => state.sequence > latest.sequence ? state : latest);
}

function versionIds(formData: FormData) {
  return [...new Set(formData.getAll("balanceVersion").filter(
    (value): value is string => typeof value === "string",
  ).map((value) => value.split("|")[0]))];
}

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

function WaiveBalanceButton({
  disabled,
  label,
  idleText = "Waive charge",
  confirmText = "Confirm waiver",
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
      aria-label={armed ? `Confirm waiver of ${label}` : `Waive ${label}`}
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
  mode = "view",
}: {
  mode?: "view" | "manage";
}) {
  const canManage = mode === "manage";
  const { rows: optimisticRows, applyMutation } = useDuesRows();
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [applyDueDate, setApplyDueDate] = useState(false);
  const [applyAmount, setApplyAmount] = useState(false);
  const [applyNotes, setApplyNotes] = useState(false);
  const [paidState, paidAction] = useActionState(setDuesPaid, initialDuesActionState);
  const [bulkPaidState, bulkPaidAction, bulkPaidPending] = useActionState(bulkSetDuesPaid, initialDuesActionState);
  const [bulkWaiveState, bulkWaiveAction, bulkWaivePending] = useActionState(bulkWaiveDuesBalances, initialDuesActionState);
  const [bulkEditState, bulkEditAction, bulkEditPending] = useActionState(bulkUpdateDuesBalances, initialDuesActionState);
  const latestBulkState = latestActionState(bulkPaidState, bulkWaiveState, bulkEditState);
  const latestChargeState = paidState;
  const bulkBusy = bulkPaidPending || bulkWaivePending || bulkEditPending;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds((current) => {
        const kept = current.filter((id) => optimisticRows.some((row) => row.id === id));
        return kept.length === current.length ? current : kept;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [optimisticRows]);

  useEffect(() => {
    if (latestBulkState.status !== "success") return;
    const timer = window.setTimeout(() => {
      setSelectedIds([]);
      setApplyDueDate(false);
      setApplyAmount(false);
      setApplyNotes(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [latestBulkState.sequence, latestBulkState.status]);

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
    setSelectionAnchorId(id);
  }

  function selectRange(id: string, addToSelection: boolean) {
    const anchorIndex = filtered.findIndex((row) => row.id === selectionAnchorId);
    const clickedIndex = filtered.findIndex((row) => row.id === id);
    if (anchorIndex < 0 || clickedIndex < 0) {
      setSelectedIds(addToSelection ? (current) => [...new Set([...current, id])] : [id]);
      setSelectionAnchorId(id);
      return;
    }

    const rangeStart = Math.min(anchorIndex, clickedIndex);
    const rangeEnd = Math.max(anchorIndex, clickedIndex);
    const rangeIds = filtered.slice(rangeStart, rangeEnd + 1).map((row) => row.id);
    setSelectedIds(addToSelection ? (current) => [...new Set([...current, ...rangeIds])] : rangeIds);
  }

  function selectRow(id: string, shiftKey: boolean, addToSelection: boolean) {
    if (shiftKey) {
      selectRange(id, addToSelection);
      return;
    }
    setSelectedIds(addToSelection
      ? (current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
      : [id]);
    setSelectionAnchorId(id);
  }

  function selectVisible() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !filtered.some((row) => row.id === id))
      : [...new Set([...current, ...filtered.map((row) => row.id)])]);
  }

  function submitPaidToggle(formData: FormData) {
    applyMutation({ type: "set-paid", ids: [String(formData.get("id"))], paid: formData.get("paid") === "true" });
    paidAction(formData);
  }

  function submitBulkPaid(formData: FormData) {
    applyMutation({ type: "set-paid", ids: versionIds(formData), paid: true });
    bulkPaidAction(formData);
  }

  function submitBulkWaive(formData: FormData) {
    applyMutation({ type: "waive", ids: versionIds(formData) });
    bulkWaiveAction(formData);
  }

  function submitBulkEdit(formData: FormData) {
    applyMutation({
      type: "bulk-edit",
      ids: versionIds(formData),
      changes: {
        ...(formData.get("applyAmount") === "on" ? { amountAssessed: Number(formData.get("amountAssessed")) } : {}),
        ...(formData.get("applyDueDate") === "on" ? { dueDate: String(formData.get("dueDate")) } : {}),
        ...(formData.get("applyNotes") === "on" ? { notes: String(formData.get("notes") ?? "") } : {}),
      },
    });
    bulkEditAction(formData);
  }

  return (
    <>
    <section className="card dues-ledger-card" aria-labelledby={`${mode}-dues-ledger-title`}>
      <div className="dues-ledger-toolbar">
        <div>
          <h2 className="card-title" id={`${mode}-dues-ledger-title`}>{canManage ? "Update existing balances" : "Member balances"}</h2>
          <p className="mt-1 text-[13px] text-muted">{canManage ? "Change amounts, due dates, notes, or balance status." : "View what members owe and review payment status."}</p>
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
          <span className="dues-selection-hint">Click a row. Shift-click selects a range.</span>
          <button disabled={!filtered.length} onClick={selectVisible} type="button">
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </button>
          {!!selectedIds.length && <button onClick={() => setSelectedIds([])} type="button">Clear selection</button>}
        </div>
        {!!selectedIds.length && <div className="dues-bulk-actions">
          <form action={submitBulkPaid}>
            {optimisticRows.filter((row) => selectedIds.includes(row.id)).map((row) => <input key={row.id} name="balanceVersion" type="hidden" value={`${row.id}|${row.updatedAt}`} />)}
            <Button compact disabled={bulkBusy} type="submit" variant="primary">Clear balances</Button>
          </form>
          <form action={submitBulkWaive}>
            {optimisticRows.filter((row) => selectedIds.includes(row.id)).map((row) => <input key={row.id} name="balanceVersion" type="hidden" value={`${row.id}|${row.updatedAt}`} />)}
            <WaiveBalanceButton
              disabled={bulkBusy}
              key={selectedIds.join(",")}
              label={`${selectedIds.length} selected balances`}
              idleText="Waive selected"
              confirmText="Confirm waiver"
            />
          </form>
          <small>Clearing marks balances fully paid and keeps their history.</small>
        </div>}
      </div>}

      {canManage && latestBulkState.message ? (
        <p aria-live="polite" className={`dues-action-feedback px-6 py-2 ${latestBulkState.status}`}>
          {latestBulkState.message}
        </p>
      ) : null}

      <div className={`dues-bulk-workspace${canManage && selectedIds.length ? " has-inspector" : ""}`}>
        <div className="dues-bulk-list">
        {filtered.length ? (
          <div className="dues-list">
            {filtered.map((row) => (
            <article
              className={`dues-row${canManage ? " selectable" : " read-only"}${canManage && selectedIds.includes(row.id) ? " selected" : ""}`}
              key={row.id}
              onClick={canManage ? (event) => {
                if ((event.target as HTMLElement).closest("a, button, form, input, label, select, textarea, [role='button']")) return;
                selectRow(row.id, event.shiftKey, event.metaKey || event.ctrlKey);
              } : undefined}
            >
              <div className="dues-person">
                {canManage && <input
                  aria-label={`Select ${row.memberName}'s balance`}
                  checked={selectedIds.includes(row.id)}
                  className="dues-select"
                  disabled={row.pending}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (event.shiftKey) {
                      selectRange(row.id, event.metaKey || event.ctrlKey);
                      return;
                    }
                    toggleSelected(row.id);
                  }}
                  onChange={() => undefined}
                  type="checkbox"
                />}
                <div className="min-w-0">
                  <h3>{row.memberName}</h3>
                  {row.notes.trim() ? <p className="dues-note">{row.notes}</p> : null}
                  {!row.memberId && <p>Account link needed.</p>}
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
                <form action={submitPaidToggle}>
                  <input name="id" type="hidden" value={row.id} />
                  <input name="paid" type="hidden" value={row.isPaid ? "false" : "true"} />
                  <input name="updatedAt" type="hidden" value={row.updatedAt} />
                  <Button compact disabled={row.pending} type="submit" variant={row.isPaid ? "secondary" : "primary"}>
                    {row.isPaid ? "Reopen balance" : "Mark fully paid"}
                  </Button>
                </form>
              </div>}
            </article>
            ))}
          </div>
        ) : (
          <div className="empty-state border-t border-rule">
            {optimisticRows.length ? "No balances match this view." : canManage ? "No balances to update." : "No dues balances yet."}
          </div>
        )}
        </div>
        {canManage && selectedIds.length > 0 ? (
          <aside className="dues-bulk-inspector" aria-labelledby="bulk-charge-editor-title">
          <form action={submitBulkEdit} className="dues-bulk-editor">
            {optimisticRows.filter((row) => selectedIds.includes(row.id)).map((row) => (
              <input key={row.id} name="balanceVersion" type="hidden" value={`${row.id}|${row.updatedAt}`} />
            ))}
            <div className="dues-bulk-editor-heading">
              <strong id="bulk-charge-editor-title">Edit {selectedIds.length} selected {selectedIds.length === 1 ? "charge" : "charges"}</strong>
              <span>Turn on each field that you want to replace.</span>
            </div>
            <label className="dues-bulk-field">
              <span><input checked={applyAmount} name="applyAmount" onChange={(event) => setApplyAmount(event.target.checked)} type="checkbox" /> Total charge amount</span>
              <div className="money-input"><span>$</span><input className="field-input" disabled={!applyAmount || bulkBusy} min="0.01" name="amountAssessed" placeholder="0.00" required={applyAmount} step="0.01" type="number" /></div>
            </label>
            <label className="dues-bulk-field">
              <span><input checked={applyDueDate} name="applyDueDate" onChange={(event) => setApplyDueDate(event.target.checked)} type="checkbox" /> Due date</span>
              <input className="field-input" disabled={!applyDueDate || bulkBusy} name="dueDate" required={applyDueDate} type="date" />
            </label>
            <label className="dues-bulk-field">
              <span><input checked={applyNotes} name="applyNotes" onChange={(event) => setApplyNotes(event.target.checked)} type="checkbox" /> Note or reason</span>
              <input className="field-input" disabled={!applyNotes || bulkBusy} maxLength={500} name="notes" placeholder="Blank removes the note" />
            </label>
            <Button compact disabled={bulkBusy || !(applyDueDate || applyAmount || applyNotes)} type="submit" variant="primary">Apply changes</Button>
          </form>
          </aside>
        ) : null}
      </div>
      {canManage && latestChargeState.message ? (
        <p aria-live="polite" className={`dues-action-feedback px-6 py-2 ${latestChargeState.status}`}>
          {latestChargeState.message}
        </p>
      ) : null}
    </section>
    </>
  );
}
