"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addDuesBalanceNote, manageDuesBalanceNote } from "./actions";
import type { DuesBalanceNote, DuesRow } from "./dues-board";
import { Button } from "@/components/brand/button";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

function BalanceNote({ note, balanceId, canManage, disabled }: {
  note: DuesBalanceNote; balanceId: string; canManage: boolean; disabled?: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [body, setBody] = useState(note.body);
  const [originalBody, setOriginalBody] = useState(note.body);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [menuOpen]);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof manageDuesBalanceNote>[0], data: FormData) => {
    const result = await manageDuesBalanceNote(previous, data);
    if (result.status === "success") setMode(null);
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const busy = pending || disabled;
  const begin = (next: "edit" | "delete") => {
    setMenuOpen(false);
    setBody(note.body);
    setOriginalBody(note.body);
    setMode(next);
  };

  return <li>
    <div className="dues-note-header">
      <div className="dues-note-meta"><strong>{note.authorName}</strong><time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time></div>
      {canManage && !mode && <div className="dues-note-menu" ref={menuRef} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}>
        <button ref={menuButtonRef} className="dues-note-menu-trigger" type="button" disabled={busy} aria-label={`Actions for note by ${note.authorName}`} aria-expanded={menuOpen} aria-controls={`note-actions-${note.id}`} onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
        </button>
        {menuOpen && <div id={`note-actions-${note.id}`} className="dues-note-menu-options" role="group" aria-label="Note actions">
          <button type="button" disabled={busy} onClick={() => begin("edit")}>Edit</button>
          <button type="button" disabled={busy} onClick={() => begin("delete")}>Delete</button>
        </div>}
      </div>}
    </div>
    {mode !== "edit" && <p>{note.body}</p>}
    {canManage && mode && <form action={action} className="dues-note-form mt-3" onReset={(event) => event.preventDefault()}>
      <input name="id" type="hidden" value={balanceId} />
      <input name="noteId" type="hidden" value={note.id} />
      <input name="originalBody" type="hidden" value={originalBody} />
      <input name="operation" type="hidden" value={mode} />
      {mode === "edit" ? <>
        <label className="field-label" htmlFor={`edit-note-${note.id}`}>Edit note</label>
        <textarea autoFocus className="field-input" id={`edit-note-${note.id}`} name="body" rows={3} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} />
      </> : <p className="text-sm text-muted">Delete this note? This cannot be undone.</p>}
      <div className="dues-note-footer">
        <Button compact type="submit" variant={mode === "delete" ? "danger" : "primary"} disabled={busy || (mode === "edit" && !body.trim())}>{pending ? "Saving…" : mode === "edit" ? "Save changes" : "Delete note"}</Button>
        <Button compact variant="secondary" disabled={pending} onClick={() => setMode(null)}>Cancel</Button>
      </div>
    </form>}
    <div aria-live="polite" className={`dues-action-feedback ${state.status}`}>{state.message}</div>
  </li>;
}

export function DuesBalanceNotes({ row, canManage, disabled }: {
  row: DuesRow;
  canManage: boolean;
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState(row.noteRequestId);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const preserveDraft = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveDraft);
    return () => form.removeEventListener("reset", preserveDraft);
  }, []);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof addDuesBalanceNote>[0], data: FormData) => {
    const result = await addDuesBalanceNote(previous, data);
    if (result.status === "success") {
      setBody("");
      setRequestId(crypto.randomUUID());
    }
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const busy = pending || row.pending || disabled;

  return <section className="dues-balance-notes" aria-label={`Notes for ${row.memberName}'s balance`}>
    <h4>Balance notes <span>({row.balanceNotes.length})</span></h4>
    {canManage && <form ref={formRef} action={action} className="dues-note-form">
      <input name="id" type="hidden" value={row.id} />
      <input name="requestId" type="hidden" value={requestId} />
      <label className="field-label" htmlFor={`balance-note-${row.id}`}>Add a note</label>
      <textarea autoFocus className="field-input" id={`balance-note-${row.id}`} name="body" rows={3} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} placeholder="Add context about this balance or payment arrangement…" />
      <div className="dues-note-footer">
        <Button compact type="submit" disabled={busy || !body.trim()}>{pending ? "Adding…" : "Add note"}</Button>
        <p aria-live="polite" className={`dues-action-feedback ${state.status}`}>{state.message}</p>
      </div>
    </form>}
    {row.balanceNotes.length ? <ol className="dues-note-history">
      {row.balanceNotes.map((note) => <BalanceNote key={note.id} note={note} balanceId={row.id} canManage={canManage} disabled={busy} />)}
    </ol> : <p className="text-sm text-muted">No notes on this balance yet.</p>}
  </section>;
}
