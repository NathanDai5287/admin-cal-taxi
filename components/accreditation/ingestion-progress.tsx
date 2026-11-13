"use client";
import { useEffect, useState } from "react";
import { manageIngestion } from "@/app/(admin)/accreditation/ingestion-actions";

export function IngestionProgress({ sourceId, type }: { sourceId: string; type: "policy" | "accreditation" }) {
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<{ id: string; status: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/accreditation/processing-status?type=${type}&ids=${sourceId}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) { setMessage(body.documents?.[0]?.ingestion_message ?? ""); setJob(body.documents?.[0]?.ingestion_job ?? null); }
      } catch { /* A missed status poll does not interrupt the saved job. */ }
    }
    void poll();
    const timer = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sourceId, type]);
  return message ? <div className="mt-1 max-w-md text-xs text-muted"><p role="status">{message}</p>{job ? <details className="mt-2"><summary>Processing options</summary><form action={async form => {
    try { const result = await manageIngestion(form); setError(result.error ?? "Request saved. Progress will update shortly."); } catch { setError("Could not update processing. Please try again."); }
  }} className="mt-2 space-y-2"><input type="hidden" name="job" value={job.id} /><input type="hidden" name="type" value={type} /><label className="block">Retry native page with AI (0 to cancel job)<input name="page" type="number" min={0} max={200} defaultValue={0} required className="field-input" /></label><button className="text-brand font-bold" type="submit">Apply</button>{error ? <p role="status">{error}</p> : null}</form></details> : null}</div> : null;
}
