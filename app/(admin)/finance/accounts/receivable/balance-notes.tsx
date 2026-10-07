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
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof manageDuesBalanceNote>[0], data: FormData) => {
    const result = await manageDuesBalanceNote(previous, data);
    if (result.status === "success") setMode(null);
    return result;
  }, { status: "idle" as const, message: "", sequence: 0 });
  const busy = pending || disabled;
  const begin = (next: "edit" | "delete") => {
    setBody(note.body);
    setOriginalBody(note.body);
    setMode(next);
  };

  return <li>
    <div className="dues-note-meta"><strong>{note.authorName}</strong><time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time></div>
    {mode !== "edit" && <p>{note.body}</p>}
    {canManage && (mode ? <form action={action} className="dues-note-form mt-3" onReset={(event) => event.preventDefault()}>
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
    </form> : <div className="dues-note-footer mt-2">
      <Button compact variant="text" disabled={busy} onClick={() => begin("edit")} aria-label={`Edit note by ${note.authorName}`}>Edit</Button>
      <Button compact variant="text" disabled={busy} onClick={() => begin("delete")} aria-label={`Delete note by ${note.authorName}`}>Delete</Button>
    </div>)}
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
