"use client";

import { useEffect, useState, useTransition } from "react";

import { updateCategory } from "@/app/(admin)/finance/review/actions";
import { Button } from "@/components/brand/button";
import {
  categories,
  formatCategory,
  type ReimbursementCategory,
} from "@/lib/reimbursements/format";

export function EditableCategory({
  category,
  id,
}: {
  category: ReimbursementCategory;
  id: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (pending || editing) return;
    const timer = window.setTimeout(() => setValue(category), 0);
    return () => window.clearTimeout(timer);
  }, [category, editing, pending]);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{formatCategory(value)}</span>
        <Button disabled={pending} variant="text" onClick={() => setEditing(true)} type="button">
          {pending ? "Saving…" : "Change"}
        </Button>
      </span>
    );
  }

  return (
    <form
      action={(formData) => {
        setError("");
        const next = String(formData.get("category")) as ReimbursementCategory;
        const previous = value;
        setValue(next);
        setEditing(false);
        startTransition(async () => {
          try {
            await updateCategory(formData);
          } catch {
            setValue(previous);
            setEditing(true);
            setError("Unable to change the category. Please try again.");
          }
        });
      }}
      className="inline-flex items-center gap-2 flex-wrap"
    >
      <input name="id" type="hidden" value={id} />
      <select
        aria-label="Reimbursement category"
        autoFocus
        className="field-input !w-auto"
        defaultValue={value}
        disabled={pending}
        name="category"
        required
      >
        {categories.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <Button variant="primary" compact disabled={pending} type="submit">
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        variant="secondary"
        compact
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
