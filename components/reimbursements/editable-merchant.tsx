"use client";
import { Button } from "@/components/brand/button";

import { useEffect, useState, useTransition } from "react";

import { updateMerchant } from "@/app/(admin)/finance/review/actions";

// Inline rename for the expense (merchant) shown in the submissions table.
export function EditableMerchant({ id, merchant }: { id: string; merchant: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(merchant ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (pending || editing) return;
    const timer = window.setTimeout(() => setValue(merchant ?? ""), 0);
    return () => window.clearTimeout(timer);
  }, [editing, merchant, pending]);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{value.trim() ? value : "Not detected"}</span>
        <Button disabled={pending} variant="text" onClick={() => setEditing(true)} type="button">
          {pending ? "Saving…" : "Rename"}
        </Button>
      </span>
    );
  }

  return (
    <form
      className="inline-flex items-center gap-2 flex-wrap"
      action={(formData) => {
        setError("");
        const next = String(formData.get("merchant") ?? "").trim();
        const previous = value;
        setValue(next);
        setEditing(false);
        startTransition(async () => {
          try {
            await updateMerchant(formData);
          } catch {
            setValue(previous);
            setEditing(true);
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
        defaultValue={value}
        maxLength={200}
        name="merchant"
        placeholder="Expense name"
        required
      />
      <Button variant="primary" compact disabled={pending} type="submit">
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        variant="secondary" compact
        disabled={pending}
        onClick={() => setEditing(false)}
        type="button"
      >
        Cancel
      </Button>
      {error ? <span className="form-message" role="alert">{error}</span> : null}
    </form>
  );
}
