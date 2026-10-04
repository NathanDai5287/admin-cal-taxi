"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { addDuesFees, type DuesActionState } from "@/app/(admin)/finance/accounts/receivable/actions";
import { useDuesRows, type DuesRow } from "@/app/(admin)/finance/accounts/receivable/dues-board";
import { Button } from "@/components/brand/button";

export type BulkFeeMember = {
  id: string;
  name: string;
};

const initialState: DuesActionState = { status: "idle", message: "", sequence: 0 };

function SubmitFeesButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending || count === 0} type="submit" variant="primary">
      {pending ? "Adding charges…" : `Add charge to ${count || "selected"} ${count === 1 ? "member" : "members"}`}
    </Button>
  );
}

function newChargeRow(member: BulkFeeMember, amount: number, dueDate: string, notes: string, today: string): DuesRow {
  return {
    id: crypto.randomUUID(),
    memberId: member.id,
    memberName: member.name,
    amountOwed: amount,
    assessedAmount: amount,
    paidAmount: 0,
    dueDate,
    notes,
    discordUserId: "",
    isPaid: false,
    isOverdue: dueDate < today,
    paymentRequestId: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    pending: true,
  };
}

export function ChargeMembersForm({
  members,
  today,
}: {
  members: BulkFeeMember[];
  today: string;
}) {
  const { applyMutation } = useDuesRows();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [state, formAction] = useActionState(addDuesFees, initialState);
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? members.filter((member) => member.name.toLowerCase().includes(normalized))
      : members;
  }, [members, query]);

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(() => setSelectedIds([]), 0);
    return () => window.clearTimeout(timer);
  }, [state]);

  function toggleMember(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((memberId) => memberId !== id)
      : [...current, id]);
  }

  function selectVisible() {
    setSelectedIds((current) => [...new Set([
      ...current,
      ...filteredMembers.map((member) => member.id),
    ])]);
  }

  function submit(formData: FormData) {
    const amount = Number(formData.get("amountOwed"));
    const dueDate = String(formData.get("dueDate"));
    const notes = String(formData.get("notes") ?? "");
    const selected = members.filter((member) => selectedIds.includes(member.id));
    if (amount > 0 && dueDate && selected.length) {
      applyMutation({
        type: "add",
        rows: selected.map((member) => newChargeRow(member, amount, dueDate, notes, today)),
      });
    }
    formAction(formData);
  }

  return (
    <section className="card" aria-labelledby="bulk-fee-title">
      <div className="card-header">
        <span className="card-title" id="bulk-fee-title">Add charge</span>
        <span className="card-subtitle">Select members, then apply the same amount, due date, and reason.</span>
      </div>
      <form action={submit} className="bulk-fee-form">
        <div className="bulk-fee-settings">
          <div className="field">
            <label className="field-label" htmlFor="bulk-fee-amount">Charge per member</label>
            <div className="money-input"><span>$</span><input className="field-input" id="bulk-fee-amount" min="0.01" name="amountOwed" placeholder="0.00" step="0.01" type="number" required /></div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bulk-fee-date">Due date</label>
            <input className="field-input" defaultValue={today} id="bulk-fee-date" name="dueDate" type="date" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bulk-fee-notes">Charge description</label>
            <input className="field-input" id="bulk-fee-notes" maxLength={500} name="notes" />
          </div>
          <label className="dues-search bulk-fee-search">
            <span className="sr-only">Search chapter members</span>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Find members to charge" type="search" value={query} />
          </label>
        </div>

        <fieldset className="bulk-fee-members">
          <legend>Chapter members <span>{selectedIds.length} selected</span></legend>
          <div className="bulk-fee-member-actions">
            <p>{members.length} active {members.length === 1 ? "member" : "members"}</p>
            <div>
              <button onClick={selectVisible} type="button">Select {query.trim() ? "matching" : "all"}</button>
              <button onClick={() => setSelectedIds([])} type="button">Clear</button>
            </div>
          </div>
          <div className="bulk-fee-member-list">
            {members.map((member) => {
              const selected = selectedIds.includes(member.id);
              return (
                <div
                  className={selected ? "selected" : ""}
                  hidden={!filteredMembers.some((filteredMember) => filteredMember.id === member.id)}
                  key={member.id}
                >
                  <label className="bulk-fee-member-choice">
                    <input checked={selected} name="memberId" onChange={() => toggleMember(member.id)} type="checkbox" value={member.id} />
                    <span>{member.name}</span>
                  </label>
                </div>
              );
            })}
            {!filteredMembers.length ? <p className="empty-state">No members match that search.</p> : null}
          </div>
        </fieldset>

        <div className="bulk-fee-footer">
          <div aria-live="polite">
            {state.message ? <p className={`form-message${state.status === "success" ? " success" : ""}`}>{state.message}</p> : null}
          </div>
          <SubmitFeesButton count={selectedIds.length} />
        </div>
      </form>
    </section>
  );
}
