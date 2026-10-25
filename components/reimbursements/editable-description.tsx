"use client";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";
import { Button } from "@/components/brand/button";

import { useEffect, useState, useTransition } from "react";

import { updateDescription } from "@/app/(admin)/finance/review/actions";

export function EditableDescription({ id, description }: { id: string; description: string }) {
  const canWrite = useAppWriteAccess();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (pending || editing) return;
    const timer = window.setTimeout(() => setValue(description), 0);
    return () => window.clearTimeout(timer);
  }, [editing, description, pending]);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{value}</span>
        <Button disabled={!canWrite || pending} variant="text" onClick={() => setEditing(true)} type="button">
          {pending ? "Saving…" : "Edit"}
        </Button>
      </span>
    );
  }

  return (
    <form
      className="inline-flex items-center gap-2 flex-wrap"
      action={(formData) => {
        setError("");
        const next = String(formData.get("description") ?? "").trim();
        const previous = value;
        setValue(next);
        setEditing(false);
        startTransition(async () => {
          try {
            await updateDescription(formData);
          } catch {
            setValue(previous);
            setEditing(true);
            setError("Unable to save the description. Please try again.");
          }
        });
      }}
    >
      <input name="id" type="hidden" value={id} />
      <input
        aria-label="Description"
        autoFocus
        className="field-input"
        defaultValue={value}
        maxLength={2000}
        name="description"
        placeholder="Description"
        required
      />
      <Button variant="primary" compact disabled={!canWrite || pending} type="submit">
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        variant="secondary" compact
        disabled={!canWrite || pending}
        onClick={() => setEditing(false)}
        type="button"
      >
        Cancel
      </Button>
      {error ? <span className="form-message" role="alert">{error}</span> : null}
    </form>
  );
}
