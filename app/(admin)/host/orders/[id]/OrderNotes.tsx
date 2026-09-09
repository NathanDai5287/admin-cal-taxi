"use client";
import { Button } from "@/components/brand/button";

/** Free-form notes on an order, saved via setOrderNotesAction. */

import { useState } from "react";
import { setOrderNotesAction } from "../actions";

export default function OrderNotes({
  orderId,
  initialNotes,
}: {
  orderId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = notes !== saved;

  function onChange(v: string) {
    setNotes(v);
    setJustSaved(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await setOrderNotesAction(orderId, notes);
    setBusy(false);
    if (result.ok) {
      setSaved(notes);
      setJustSaved(true);
    } else {
      setError(result.error);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Notes</span>
        <span className="card-subtitle">Free-form, visible only in the archive.</span>
      </div>
      <div className="card-body space-y-3">
        <textarea
          className="field-textarea"
          rows={4}
          value={notes}
          onChange={e => onChange(e.target.value)}
          placeholder="Anything worth remembering about this rental…"
        />
        <div className="flex items-center gap-4">
          <Button type="button" variant="secondary" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save Notes"}
          </Button>
          {!busy && justSaved && !dirty && <span className="text-[12px] text-ok">Saved</span>}
          {!busy && error && <span className="text-[12px] text-warn">{error}</span>}
        </div>
      </div>
    </section>
  );
}
