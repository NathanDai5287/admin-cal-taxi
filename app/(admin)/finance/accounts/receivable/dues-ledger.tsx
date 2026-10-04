"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  bulkUpdateDuesBalances,
  bulkWaiveDuesBalances,
  bulkSetDuesPaid,
  setDuesPaid,
  type DuesActionState,
} from "@/app/(admin)/finance/accounts/receivable/actions";
import { DuesPaymentForm } from "./payment-form";
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
  today = "",
  chargeForm,
}: {
  mode?: "view" | "manage";
  today?: string;
  chargeForm?: ReactNode;
}) {
  const canManage = mode === "manage";
  const { rows: optimisticRows, applyMutation } = useDuesRows();
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [query, setQuery] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [sort, setSort] = useState("due-date");
  const [page, setPage] = useState(1);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [showChargeForm, setShowChargeForm] = useState(false);
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
    }).sort((a, b) => (sort === "name" ? a.memberName.localeCompare(b.memberName) : sort === "amount" ? b.amountOwed - a.amountOwed : a.dueDate.localeCompare(b.dueDate)) || a.memberName.localeCompare(b.memberName) || a.id.localeCompare(b.id));
  }, [filter, query, sort, optimisticRows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filtered.slice((currentPage - 1) * 25, currentPage * 25);

  const counts: Record<Filter, number> = {
    outstanding: optimisticRows.filter((row) => !row.isPaid).length,
    overdue: optimisticRows.filter((row) => row.isOverdue).length,
    paid: optimisticRows.filter((row) => row.isPaid).length,
    all: optimisticRows.length,
  };
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
    setSelectionAnchorId(id);
  }

  function selectRange(id: string, addToSelection: boolean) {
    const anchorIndex = visibleRows.findIndex((row) => row.id === selectionAnchorId);
    const clickedIndex = visibleRows.findIndex((row) => row.id === id);
    if (anchorIndex < 0 || clickedIndex < 0) {
      setSelectedIds(addToSelection ? (current) => [...new Set([...current, id])] : [id]);
      setSelectionAnchorId(id);
      return;
    }

    const rangeStart = Math.min(anchorIndex, clickedIndex);
    const rangeEnd = Math.max(anchorIndex, clickedIndex);
    const rangeIds = visibleRows.slice(rangeStart, rangeEnd + 1).map((row) => row.id);
    setSelectedIds(addToSelection ? (current) => [...new Set([...current, ...rangeIds])] : rangeIds);
  }

  function selectVisible() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleRows.some((row) => row.id === id))
      : [...new Set([...current, ...visibleRows.map((row) => row.id)])]);
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
          <h2 className="card-title" id={`${mode}-dues-ledger-title`}>Member balances</h2>
          <p className="mt-1 text-[13px] text-muted">{canManage ? "Find a charge, record a payment, or open its details." : "View what members owe and review payment status."}</p>
        </div>
        <label className="dues-search">
          <span className="sr-only">Search member balances</span>
          <SearchIcon />
          <input
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder="Search by member or charge"
            type="search"
            value={query}
          />
        </label>
        {canManage && chargeForm && <Button compact aria-expanded={showChargeForm} aria-controls="dues-add-charge" onClick={() => setShowChargeForm(!showChargeForm)}>{showChargeForm ? "Close charge form" : "Add charge"}</Button>}
      </div>
      {showChargeForm && <div id="dues-add-charge" className="dues-add-charge">{chargeForm}</div>}

      <div className="dues-filter-bar" role="group" aria-label="Filter member balances">
        {(["outstanding", "overdue", "paid", "all"] as const).map((value) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => { setFilter(value); setPage(1); }}
            type="button"
          >
            <span className="capitalize">{value}</span>
            <span className="dues-filter-count">{counts[value]}</span>
          </button>
        ))}
      </div>

      <div className="dues-list-controls">
        {canManage && <label className="dues-select-page"><input type="checkbox" checked={allVisibleSelected} disabled={!visibleRows.length || bulkBusy} onChange={selectVisible} /> Select this page</label>}
        <label className="dues-sort">Sort by <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="due-date">Due date</option><option value="name">Member name</option><option value="amount">Remaining amount</option></select></label>
      </div>

      {canManage && selectedIds.length > 0 && <div className="dues-bulk-toolbar">
        <div className="dues-bulk-selection">
          <strong>{selectedIds.length ? `${selectedIds.length} selected` : "Select balances for bulk changes"}</strong>
          <span className="dues-selection-hint">Use checkboxes. Shift-click selects a range.</span>
          <button disabled={!visibleRows.length} onClick={selectVisible} type="button">
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </button>
          {!!selectedIds.length && <button onClick={() => setSelectedIds([])} type="button">Clear selection</button>}
        </div>
        {!!selectedIds.length && <div className="dues-bulk-actions">
          <form action={submitBulkPaid}>
            {optimisticRows.filter((row) => selectedIds.includes(row.id)).map((row) => <input key={row.id} name="balanceVersion" type="hidden" value={`${row.id}|${row.updatedAt}`} />)}
            <Button compact disabled={bulkBusy} type="submit" variant="primary">Mark selected fully paid</Button>
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
          <small>Records the remaining amounts as payments dated today.</small>
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
            {visibleRows.map((row) => (
            <article className={`dues-charge${selectedIds.includes(row.id) ? " selected" : ""}`} key={row.id}>
            <div className="dues-row">
              <div className="dues-person">
                {canManage && <input
                  aria-label={`Select ${row.memberName}'s balance`}
                  checked={selectedIds.includes(row.id)}
                  className="dues-select"
                  disabled={row.pending || bulkBusy}
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
                  <h3><button className="dues-member-button" type="button" aria-expanded={openRowId === row.id} aria-controls={`dues-detail-${row.id}`} onClick={() => setOpenRowId(openRowId === row.id ? null : row.id)}>{row.memberName}</button></h3>
                  {row.notes.trim() ? <p className="dues-note">{row.notes}</p> : null}
                  <p>
                    Due {formatDate(row.dueDate)}
                    {row.isOverdue ? <span className="dues-overdue-label">Overdue</span> : null}
                    {row.isPaid ? <span className="dues-paid-label">Paid</span> : null}
                  </p>
                  {row.paidAmount > 0 ? (
                    <p>Paid {formatMoney(row.paidAmount)} of {formatMoney(row.assessedAmount)}</p>
                  ) : null}
                </div>
              </div>

              <div className="dues-balance">
                <span>{row.isPaid ? "Paid" : "Remaining"}</span>
                <strong>{formatMoney(row.amountOwed)}</strong>
              </div>

              <div className="dues-actions">
                <Button compact disabled={row.pending} variant={row.isPaid ? "secondary" : "primary"} aria-expanded={openRowId === row.id} aria-controls={`dues-detail-${row.id}`} onClick={() => setOpenRowId(openRowId === row.id ? null : row.id)}>{row.isPaid || !canManage ? "View details" : openRowId === row.id ? "Close details" : "Record payment"}</Button>
              </div>
            </div>
            {openRowId === row.id && <div className="dues-charge-detail" id={`dues-detail-${row.id}`}>
              <dl className="dues-detail-facts">
                <div><dt>Total charge</dt><dd>{formatMoney(row.assessedAmount)}</dd></div>
                <div><dt>Paid to date</dt><dd>{formatMoney(row.paidAmount)}</dd></div>
                <div><dt>Account</dt><dd>{row.memberId ? "Linked" : "Account link needed"}</dd></div>
                <div><dt>Discord</dt><dd>{row.discordUserId ? "Linked" : "Not linked"}</dd></div>
              </dl>
              {canManage && !row.isPaid && <DuesPaymentForm row={row} today={today} onRecorded={setPaymentMessage} />}
              {canManage && row.isPaid && <form action={submitPaidToggle}>
                <input name="id" type="hidden" value={row.id} />
                <input name="paid" type="hidden" value="false" />
                <input name="updatedAt" type="hidden" value={row.updatedAt} />
                <p className="mb-2 text-xs text-muted">Reopening reverses all recorded payments on this charge and restores its full balance.</p>
                <Button compact disabled={row.pending} type="submit" variant="secondary">Reopen balance</Button>
              </form>}
            </div>}
            </article>
            ))}
          </div>
        ) : (
          <div className="empty-state border-t border-rule">
            {optimisticRows.length ? "No charges match this search and filter. Try All or clear your search." : canManage ? "No balances to update." : "No dues balances yet."}
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
      {filtered.length > 0 && <nav className="dues-pagination" aria-label="Balance pages">
        <span>{(currentPage - 1) * 25 + 1}–{Math.min(currentPage * 25, filtered.length)} of {filtered.length} charges</span>
        <div><Button compact variant="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button compact variant="secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
      </nav>}
      <p role="status" className="dues-action-feedback success px-4 py-2">{paymentMessage}</p>
      {canManage && latestChargeState.message ? (
        <p aria-live="polite" className={`dues-action-feedback px-6 py-2 ${latestChargeState.status}`}>
          {latestChargeState.message}
        </p>
      ) : null}
    </section>
    </>
  );
}
