"use client";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { processingAction } from "@/lib/accreditation/processing-presentation";
import { startDocumentProcessing } from "@/app/(admin)/accreditation/ingestion-actions";
import { processingMonitor, useProcessingStatuses } from "./processing-status";

export function ProcessingAction({ sourceId, type, status }: { sourceId: string; type: "policy" | "accreditation"; status: string }) {
  const row = useProcessingStatuses(type, [sourceId])[sourceId];
  const action = processingAction(row, status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <form action={async form => {
    if (pending || action.disabled) return;
    setPending(true); setError("");
    try {
      const result = await startDocumentProcessing(form);
      if (result.error) setError(result.error);
      else {
        processingMonitor(type).seed([{ ...row, id: sourceId, active: result.queued, ingestion_status: result.queued ? "queued" : "complete", ingestion_message: result.queued ? "Queued" : "Processing complete" }]);
        processingMonitor(type).refresh([sourceId]);
      }
    } catch { setError("Could not start processing. Your saved progress is unchanged."); }
    finally { setPending(false); }
  }} className="space-y-2">
    <input type="hidden" name="sourceId" value={sourceId} /><input type="hidden" name="type" value={type} />
    {!action.disabled ? <label className="block text-xs"><input name="signatureFree" type="checkbox" required disabled={pending} /> Source and text contain no signatures</label> : null}
    <Button type="submit" variant="secondary" compact className="rounded-full" disabled={pending || action.disabled}>{pending ? "Starting…" : action.label}</Button>
    {error ? <p role="alert" className="text-xs text-warn">{error}</p> : null}
  </form>;
}
