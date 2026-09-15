"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/brand/button";

export function OptimisticDeleteButton({ action, label = "Remove", name = "id", value }: {
  action: (formData: FormData) => Promise<unknown>;
  label?: string;
  name?: string;
  value: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    const row = rootRef.current?.closest("tr");
    if (row instanceof HTMLElement) row.hidden = true;
    setError("");
    const formData = new FormData();
    formData.set(name, value);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (
          result
          && typeof result === "object"
          && "ok" in result
          && result.ok === false
        ) {
          throw new Error("message" in result && typeof result.message === "string" ? result.message : undefined);
        }
        router.refresh();
      } catch (reason) {
        if (row instanceof HTMLElement) row.hidden = false;
        setError(reason instanceof Error && reason.message
          ? reason.message
          : "Could not remove this item. Try again.");
      }
    });
  }

  return (
    <span ref={rootRef}>
      <Button compact disabled={pending} onClick={remove} variant="secondary">
        {pending ? "Removing…" : label}
      </Button>
      {error ? <span className="form-message ml-2" role="alert">{error}</span> : null}
    </span>
  );
}
