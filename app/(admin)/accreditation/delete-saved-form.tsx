"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { deleteAccreditationSavedForm } from "./document-actions";

export function DeleteSavedForm({ id, name, disabled, onDeleted, returnTo = "/accreditation/templates" }: {
  id: string; name: string; disabled?: boolean; onDeleted?: () => Promise<void>; returnTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  if (!confirming) return <Button compact variant="danger" disabled={disabled} onClick={() => setConfirming(true)}>Delete saved form</Button>;
  return <div className="border border-rule p-4 space-y-3" role="group" aria-label={`Delete ${name}`}>
    <p className="text-sm font-semibold">Delete “{name}”?</p>
    <p className="text-sm text-muted">This removes the form and its examples from the library. Existing submissions and PDFs remain in your submission history.</p>
    {error && <p className="text-sm text-warn" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button variant="danger" disabled={pending || disabled} onClick={() => {
      setError("");
      startTransition(async () => {
        try {
          const result = await deleteAccreditationSavedForm(id);
          if (!result.ok) { setError(result.error); return; }
          if (onDeleted) await onDeleted();
          else { router.replace(returnTo); router.refresh(); }
          setConfirming(false);
        } catch { setError("The form could not be deleted. Please retry."); }
      });
    }}>{pending ? "Deleting…" : "Delete form"}</Button><Button variant="secondary" disabled={pending} onClick={() => { setConfirming(false); setError(""); }}>Cancel</Button></div>
  </div>;
}
