"use client";

import { useActionState, useMemo, useState } from "react";

import {
  sendMemberAnnouncement,
  type MemberAnnouncementState,
} from "@/app/(admin)/users/announcement-actions";
import { Button } from "@/components/brand/button";

export type AnnouncementMember = {
  id: string;
  name: string;
  email: string;
  discordUserId: string;
};

const initialState: MemberAnnouncementState = { status: "idle", message: "", sequence: 0 };
const maximumRecipients = 100;

function validDiscordId(value: string) {
  return /^\d{15,22}$/.test(value);
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function MemberAnnouncementComposer({
  members,
  channelConfigured,
}: {
  members: AnnouncementMember[];
  channelConfigured: boolean;
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [state, formAction, pending] = useActionState(sendMemberAnnouncement, initialState);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return members.filter((member) => !normalizedQuery
      || member.name.toLowerCase().includes(normalizedQuery)
      || member.email.toLowerCase().includes(normalizedQuery));
  }, [members, query]);
  const selectable = filtered.filter((member) => validDiscordId(member.discordUserId));
  const selectedMembers = useMemo(
    () => members.filter((member) => selectedIds.includes(member.id)),
    [members, selectedIds],
  );
  const mentionMembers = useMemo(() => {
    const seen = new Set<string>();
    return selectedMembers.filter((member) => {
      if (!validDiscordId(member.discordUserId) || seen.has(member.discordUserId)) return false;
      seen.add(member.discordUserId);
      return true;
    });
  }, [selectedMembers]);
  const allVisibleSelected = selectable.length > 0 && selectable.every((member) => selectedIds.includes(member.id));
  const nextVisibleCount = allVisibleSelected
    ? selectedIds.length - selectable.filter((member) => selectedIds.includes(member.id)).length
    : selectedIds.length + selectable.filter((member) => !selectedIds.includes(member.id)).length;
  const previewContent = message.trim()
    ? `${message.trim()}\n\n${mentionMembers.map((member) => `<@${member.discordUserId}>`).join("\n")}`
    : "";
  const tooLong = previewContent.length > 2000;

  function toggleSelected(id: string) {
    setSelectionNotice("");
    if (!selectedIds.includes(id) && selectedIds.length >= maximumRecipients) {
      setSelectionNotice(`Discord messages can mention up to ${maximumRecipients} members at once.`);
      return;
    }
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
    setSelectionAnchorId(id);
  }

  function selectRange(id: string, addToSelection: boolean) {
    const anchorIndex = filtered.findIndex((member) => member.id === selectionAnchorId);
    const clickedIndex = filtered.findIndex((member) => member.id === id);
    if (anchorIndex < 0 || clickedIndex < 0) {
      if (!addToSelection) setSelectedIds([id]);
      else toggleSelected(id);
      setSelectionAnchorId(id);
      return;
    }

    const rangeIds = filtered
      .slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1)
      .filter((member) => validDiscordId(member.discordUserId))
      .map((member) => member.id);
    const nextIds = addToSelection
      ? [...new Set([...selectedIds, ...rangeIds])]
      : rangeIds;
    if (nextIds.length > maximumRecipients) {
      setSelectionNotice(`Select up to ${maximumRecipients} members per message.`);
      return;
    }
    setSelectionNotice("");
    setSelectedIds(nextIds);
    setSelectionAnchorId(id);
  }

  function selectRow(id: string, shiftKey: boolean, addToSelection: boolean) {
    if (shiftKey) {
      selectRange(id, addToSelection);
      return;
    }
    setSelectionNotice("");
    if (addToSelection && !selectedIds.includes(id) && selectedIds.length >= maximumRecipients) {
      setSelectionNotice(`Discord messages can mention up to ${maximumRecipients} members at once.`);
      return;
    }
    setSelectedIds((current) => addToSelection
      ? current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
      : [id]);
    setSelectionAnchorId(id);
  }

  function selectVisible() {
    setSelectionNotice("");
    if (!allVisibleSelected && nextVisibleCount > maximumRecipients) {
      setSelectionNotice(`Select up to ${maximumRecipients} members per message.`);
      return;
    }
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !selectable.some((member) => member.id === id))
      : [...new Set([...current, ...selectable.map((member) => member.id)])]);
    if (selectable.length) setSelectionAnchorId(selectable[0].id);
  }

  function submitAnnouncement(formData: FormData) {
    formData.set("requestId", crypto.randomUUID());
    formAction(formData);
  }

  return (
    <section className="card" aria-labelledby="member-announcement-title">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="member-announcement-title">Choose recipients</h2>
          <p className="mt-1 text-[12px] text-muted">Select a member row or use Shift-click to select a range.</p>
        </div>
        <label className="dues-search min-w-[230px]">
          <span className="sr-only">Search members</span>
          <SearchIcon />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search members" type="search" value={query} />
        </label>
      </div>

      <div className="dues-bulk-toolbar">
        <div className="dues-bulk-selection">
          <strong>{selectedIds.length ? `${selectedIds.length} selected` : "No members selected"}</strong>
          <span className="dues-selection-hint">Only linked members can be selected. Maximum {maximumRecipients} per message.</span>
          <button disabled={!selectable.length || (!allVisibleSelected && nextVisibleCount > maximumRecipients)} onClick={selectVisible} title={nextVisibleCount > maximumRecipients ? `Select up to ${maximumRecipients} members at once` : undefined} type="button">
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </button>
          {selectedIds.length > 0 ? <button onClick={() => { setSelectedIds([]); setSelectionAnchorId(null); setSelectionNotice(""); }} type="button">Clear selection</button> : null}
        </div>
      </div>

      {selectionNotice ? <p aria-live="polite" className="dues-action-feedback error px-6 py-2">{selectionNotice}</p> : null}

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
        <div className="dues-list min-w-0">
          {filtered.length ? filtered.map((member) => {
            const canSelect = validDiscordId(member.discordUserId);
            const selected = selectedIds.includes(member.id);
            return (
              <article
                className={`dues-row selectable${selected ? " selected" : ""}${!canSelect ? " opacity-60" : ""}`}
                key={member.id}
                onClick={canSelect ? (event) => {
                  if ((event.target as HTMLElement).closest("a, button, form, input, label, select, textarea, [role='button']")) return;
                  selectRow(member.id, event.shiftKey, event.metaKey || event.ctrlKey);
                } : undefined}
              >
                <div className="dues-person">
                  <input
                    aria-label={`Select ${member.name}`}
                    checked={selected}
                    className="dues-select"
                    disabled={!canSelect || (!selected && selectedIds.length >= maximumRecipients)}
                    onChange={() => undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.shiftKey) selectRange(member.id, event.metaKey || event.ctrlKey);
                      else toggleSelected(member.id);
                    }}
                    type="checkbox"
                  />
                  <div className="min-w-0">
                    <h3>{member.name}</h3>
                    <p>{canSelect ? "Discord linked" : "Discord ID needed"}<span aria-hidden="true">·</span>{member.email}</p>
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="empty-state border-t border-rule">{members.length ? "No members match your search." : "No active members yet."}</div>
          )}
        </div>

        <aside className="border-t border-rule bg-brand-light p-5 lg:border-l lg:border-t-0" aria-labelledby="message-composer-title">
          <form action={submitAnnouncement} className="grid gap-4">
            {selectedIds.map((id) => <input key={id} name="recipientId" type="hidden" value={id} />)}
            <div>
              <h2 className="text-sm font-bold text-ink" id="message-composer-title">Write your message</h2>
              <p className="mt-1 text-[12px] text-muted">Selected members will be mentioned below your message.</p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="member-announcement-message">Message</label>
              <textarea
                className="field-textarea min-h-[132px]"
                id="member-announcement-message"
                maxLength={1200}
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write a message for your selected members…"
                required
                value={message}
              />
              <p className="field-hint">{message.length}/1,200 characters. @everyone and role mentions will not ping.</p>
            </div>

            <div className="dues-message-preview" aria-label="Discord message preview">
              <span>Preview · {mentionMembers.length} {mentionMembers.length === 1 ? "mention" : "mentions"}</span>
              <p>{message.trim() || "Your message will appear here."}</p>
              {mentionMembers.map((member) => (
                <p className="dues-preview-recipient" key={member.discordUserId}><b>@{member.name}</b></p>
              ))}
              <p className="mt-2 text-right text-xs text-muted">{previewContent.length}/2,000 Discord characters</p>
            </div>

            {!channelConfigured ? <p className="text-[12px] text-warn">The Discord announcement channel is not configured.</p> : null}
            {tooLong ? <p className="text-[12px] text-warn">Shorten the message or select fewer members to fit Discord’s 2,000 character limit.</p> : null}
            {state.message ? (
              <p aria-live="polite" className={`dues-action-feedback ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
                {state.message}
              </p>
            ) : null}

            <Button
              className="w-full"
              disabled={pending || !channelConfigured || !selectedIds.length || !message.trim() || tooLong}
              type="submit"
              variant="primary"
            >
              {pending ? "Sending…" : `Send to ${mentionMembers.length || selectedIds.length}`}
            </Button>
          </form>
        </aside>
      </div>
    </section>
  );
}
