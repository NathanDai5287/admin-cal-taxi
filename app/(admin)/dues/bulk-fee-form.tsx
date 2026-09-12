"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { addBulkDuesFees } from "@/app/(admin)/dues/actions";
import { Button } from "@/components/brand/button";

export type BulkFeeMember = {
  id: string;
  name: string;
  discordUserId: string;
};

function SubmitFeesButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending || count === 0} type="submit" variant="primary">
      {pending ? "Applying fees…" : `Apply fee to ${count || "selected"}`}
    </Button>
  );
}

export function BulkFeeForm({
  members,
  today,
  feedback,
}: {
  members: BulkFeeMember[];
  today: string;
  feedback?: { text: string; success: boolean };
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? members.filter((member) => member.name.toLowerCase().includes(normalized))
      : members;
  }, [members, query]);

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

  return (
    <section className="card" aria-labelledby="bulk-fee-title">
      <div className="card-header">
        <span className="card-title" id="bulk-fee-title">Apply a fee to members</span>
        <span className="card-subtitle">Choose members, then add Discord IDs and a note for each fee.</span>
      </div>
      <form action={addBulkDuesFees} className="bulk-fee-form">
        <div className="bulk-fee-settings">
          <div className="field">
            <label className="field-label" htmlFor="bulk-fee-amount">Fee per member</label>
            <div className="money-input"><span>$</span><input className="field-input" id="bulk-fee-amount" min="0.01" name="amountOwed" placeholder="0.00" step="0.01" type="number" required /></div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bulk-fee-date">Due date</label>
            <input className="field-input" defaultValue={today} id="bulk-fee-date" name="dueDate" type="date" required />
          </div>
          <label className="dues-search bulk-fee-search">
            <span className="sr-only">Search chapter members</span>
            <span aria-hidden="true">⌕</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search members" type="search" value={query} />
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
                  <div className="field">
                    <label className="field-label" htmlFor={`bulk-discord-${member.id}`}>Discord ID</label>
                    <input
                      className="field-input"
                      defaultValue={member.discordUserId}
                      disabled={!selected}
                      id={`bulk-discord-${member.id}`}
                      inputMode="numeric"
                      maxLength={25}
                      name={`discordUserId:${member.id}`}
                      pattern="(?:[0-9]{15,22}|<@!?[0-9]{15,22}>)"
                      placeholder="Optional numeric ID"
                      title="Enter a 15–22 digit Discord user ID or paste a Discord mention"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`bulk-note-${member.id}`}>Note</label>
                    <input className="field-input" disabled={!selected} id={`bulk-note-${member.id}`} maxLength={500} name={`notes:${member.id}`} placeholder="Reason for fee" />
                  </div>
                </div>
              );
            })}
            {!filteredMembers.length ? <p className="empty-state">No members match that search.</p> : null}
          </div>
        </fieldset>

        <div className="bulk-fee-footer">
          <div aria-live="polite">
            {feedback ? <p className={`form-message${feedback.success ? " success" : ""}`}>{feedback.text}</p> : null}
          </div>
          <SubmitFeesButton count={selectedIds.length} />
        </div>
      </form>
    </section>
  );
}
