"use client";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { processingProgress, processingReady } from "@/lib/accreditation/processing-presentation";
import { processingMonitor, useProcessingStatuses } from "./processing-status";
import { manageIngestion, startDocumentProcessing, stopDocumentProcessing } from "@/app/(admin)/accreditation/ingestion-actions";

export function IngestionProgress({ sourceId, type }: { sourceId: string; type: "policy" | "accreditation" }) {
  const rows = useProcessingStatuses(type, [sourceId]);
  const message = rows[sourceId]?.ingestion_message;
  const job = rows[sourceId]?.ingestion_job;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const row = rows[sourceId];
  if (!message || !row) return null;
  const progress = processingProgress(row);
  const ready = processingReady(row);
  return <div className="mt-3 w-full min-w-40 max-w-xs space-y-2 text-xs text-muted">{!ready ? <p role="status" className="font-semibold text-ink">{job ? progress.label : message}</p> : null}
    {job && row.active ? <form action={async form => {
      if (pending) return;
      setPending(true); setError("");
      try {
        const result = await stopDocumentProcessing(form);
        if (result.error) setError(result.error);
        else if (result.status) {
          processingMonitor(type).seed([{ ...row, active: false, ingestion_status: result.status,
            ingestion_message: result.status === "paused" ? "Stopped; progress saved. Resume processing to continue." : result.status }]);
          processingMonitor(type).refresh([sourceId]);
        }
      } catch { setError("Could not stop processing. Refresh status and try again."); }
      finally { setPending(false); }
    }}><input type="hidden" name="job" value={job.id} /><input type="hidden" name="type" value={type} />
      <Button type="submit" variant="secondary" compact disabled={pending}>{pending ? "Stopping…" : "Stop processing"}</Button>
      <p className="mt-1">Saved progress is kept for resuming.</p>
    </form> : null}
    {error ? <p role="status">{error}</p> : null}
    {job && !ready ? <><div role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value} aria-valuetext={progress.value === undefined ? progress.label : `${progress.value}% of this stage complete`} className="h-2 overflow-hidden rounded-full bg-rule"><div className={`h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none ${progress.value === undefined && row.ingestion_status === "running" ? "motion-safe:animate-pulse" : ""}`} style={{ width: `${progress.value ?? (row.ingestion_status === "running" ? 30 : 0)}%` }} /></div>
    {progress.total > 0 && row.ingestion_status !== "complete" ? <p>{progress.completed}/{progress.total} {job.stage === "extraction" ? "pages read" : "passages embedded"}</p> : null}
    {["paused", "waiting"].includes(row.ingestion_status ?? "") ? <p>{message}</p> : null}</> : null}
    {job ? <details className="group rounded-xl border border-rule bg-canvas"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 font-semibold text-brand hover:bg-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">Processing options<svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-none stroke-current transition-transform group-open:rotate-180"><path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
    <div className="space-y-4 border-t border-rule p-3">{row.active || row.ingestion_status === "paused" ? <p>{row.active ? "Processing is active." : "Resume processing to finish this pass."} Advanced rebuild actions become available when it finishes.</p> : <>
    <form action={async form => {
      if (pending) return;
      setPending(true); setError("");
      try { const result = await startDocumentProcessing(form); setError(result.error ?? "Embedding regeneration queued."); if (!result.error) processingMonitor(type).refresh([sourceId]); }
      catch { setError("Could not queue regeneration. Saved progress is unchanged."); }
      finally { setPending(false); }
    }} className="space-y-2"><input type="hidden" name="sourceId" value={sourceId} /><input type="hidden" name="type" value={type} /><input type="hidden" name="intent" value="embeddings" /><p>Reuse the saved text and regenerate its embeddings. This makes new AI requests.</p><label className="block"><input name="signatureFree" type="checkbox" required disabled={pending} /> Saved text contains no signatures</label><Button type="submit" variant="secondary" compact className="rounded-full" disabled={pending}>Regenerate embeddings</Button></form>
    <form action={async form => {
    if (pending) return;
    setPending(true); setError("");
    try { const result = await manageIngestion(form); setError(result.error ?? "Request saved."); if (!result.error) processingMonitor(type).refresh([sourceId]); } catch { setError("Could not update processing. Please try again."); }
    finally { setPending(false); }
  }} className="space-y-2 border-t border-rule pt-3"><input type="hidden" name="job" value={job.id} /><input type="hidden" name="type" value={type} /><label className="block">Re-extract a native-text page with AI<input name="page" type="number" min={1} max={row.pages_total ?? 200} required className="field-input mt-1" disabled={pending} /></label><p>Use this when a page’s extracted text is incorrect. This starts a new processing pass.</p><Button type="submit" variant="secondary" compact className="rounded-full" disabled={pending}>Re-extract page</Button></form></>}</div></details> : null}</div>;
}
