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
    <section className="min-w-0">
      <h2 className="text-lg font-semibold">Notes</h2>
      <div className="mt-3 space-y-2">
        <textarea
          className="field-textarea"
          rows={2}
          aria-label="Order notes"
          value={notes}
          onChange={e => onChange(e.target.value)}
          placeholder="Add a note"
        />
        <div className="flex items-center gap-4">
          <Button compact type="button" variant="text" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save Notes"}
          </Button>
          {!busy && justSaved && !dirty && <span className="text-[12px] text-ok">Saved</span>}
          {!busy && error && <span className="text-[12px] text-warn">{error}</span>}
        </div>
      </div>
    </section>
  );
}
