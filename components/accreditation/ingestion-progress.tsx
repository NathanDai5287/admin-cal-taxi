"use client";
import { useState } from "react";
import { processingMonitor, useProcessingStatuses } from "./processing-status";
import { manageIngestion } from "@/app/(admin)/accreditation/ingestion-actions";

export function IngestionProgress({ sourceId, type }: { sourceId: string; type: "policy" | "accreditation" }) {
  const rows = useProcessingStatuses(type, [sourceId]);
  const message = rows[sourceId]?.ingestion_message;
  const job = rows[sourceId]?.ingestion_job;
  const [error, setError] = useState("");
  return message ? <div className="mt-1 max-w-md text-xs text-muted"><p role="status">{message}</p>{job ? <details className="mt-2"><summary>Processing options</summary><form action={async form => {
    try { const result = await manageIngestion(form); setError(result.error ?? "Request saved."); if (!result.error) processingMonitor(type).refresh([sourceId]); } catch { setError("Could not update processing. Please try again."); }
  }} className="mt-2 space-y-2"><input type="hidden" name="job" value={job.id} /><input type="hidden" name="type" value={type} /><label className="block">Retry native page with AI (0 to cancel job)<input name="page" type="number" min={0} max={200} defaultValue={0} required className="field-input" /></label><button className="text-brand font-bold" type="submit">Apply</button>{error ? <p role="status">{error}</p> : null}</form></details> : null}</div> : null;
}
