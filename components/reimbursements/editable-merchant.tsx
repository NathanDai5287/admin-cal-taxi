"use client";

import { useState, useTransition } from "react";

import { updateMerchant } from "@/app/(admin)/reimbursements/(review)/actions";

// Inline rename for the expense (merchant) shown in the submissions table.
export function EditableMerchant({ id, merchant }: { id: string; merchant: string | null }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{merchant?.trim() ? merchant : "Not detected"}</span>
        <button className="btn-link" onClick={() => setEditing(true)} type="button">
          Rename
        </button>
      </span>
    );
  }

  return (
    <form
      className="inline-flex items-center gap-2 flex-wrap"
      action={(formData) => {
        setError("");
        startTransition(async () => {
          try {
            await updateMerchant(formData);
            setEditing(false);
          } catch {
            setError("Unable to rename. Please try again.");
          }
        });
      }}
    >
      <input name="id" type="hidden" value={id} />
      <input
        aria-label="Expense name"
        autoFocus
        className="field-input"
        defaultValue={merchant ?? ""}
        maxLength={200}
        name="merchant"
        placeholder="Expense name"
        required
      />
      <button className="btn-primary btn-compact" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        className="btn-ghost btn-compact"
        disabled={pending}
        onClick={() => setEditing(false)}
        type="button"
      >
        Cancel
      </button>
      {error ? <span className="form-message">{error}</span> : null}
    </form>
  );
}
