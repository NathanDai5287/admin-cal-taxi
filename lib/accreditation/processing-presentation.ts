import type { ProcessingStatus } from "./processing-monitor";
export function processingReady(row?: ProcessingStatus, sourceStatus?: string) {
  return !row?.active && (row?.ingestion_status === "complete" || (!row?.ingestion_status && (row?.status ?? sourceStatus) === "ready"));
}

export function processingLabel(row?: ProcessingStatus, sourceStatus = "") {
  if ((row?.status ?? sourceStatus) === "archived") return "archived";
  if (processingReady(row, sourceStatus)) return "ready";
  return row?.ingestion_status ?? (["processing", "pending"].includes(sourceStatus) ? "Uploaded—not queued" : sourceStatus);
}

export function processingAction(row?: ProcessingStatus, sourceStatus?: string) {
  if (row?.active) return { label: row.ingestion_status === "running" ? "Processing…" : row.ingestion_status === "waiting" ? "Waiting for capacity" : "Queued", disabled: true };
  if (processingReady(row, sourceStatus)) return { label: "Ready", disabled: true };
  return { label: ["paused", "failed"].includes(row?.ingestion_status ?? "") ? "Resume processing" : "Start processing", disabled: false };
}
export function processingProgress(row: ProcessingStatus) {
  const stage = row.ingestion_job?.stage;
  const extraction = stage === "extraction";
  const completed = extraction ? row.pages_completed ?? 0 : row.processing_completed ?? 0;
  const total = extraction ? row.pages_total ?? 0 : row.processing_total ?? 0;
  const measurable = extraction || stage === "embedding";
  const complete = row.ingestion_status === "complete";
  return { completed, total, value: complete ? 100 : measurable && total > 0 ? Math.min(100, Math.round(completed / total * 100)) : undefined,
    label: complete ? "Processing complete" : row.ingestion_status === "cancelled" ? "Processing cancelled" : row.ingestion_status === "failed" ? "Processing failed — progress saved" : row.ingestion_status === "queued" ? "Queued — waiting for the worker" : row.ingestion_status === "waiting" ? "Waiting for capacity — progress saved" : row.ingestion_status === "paused" ? "Paused — progress saved" : extraction ? `Extracting text · ${completed}/${total} pages` : stage === "embedding" ? `Embedding · ${completed}/${total} passages` : stage === "chunking" ? "Preparing text passages" : "Checking document" };
}
