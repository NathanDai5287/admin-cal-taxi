"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { EMPTY_STATUSES, ProcessingMonitor, type ProcessingStatus } from "@/lib/accreditation/processing-monitor";

const monitors = new Map<string, ProcessingMonitor>();
export function processingMonitor(type: string) {
  let monitor = monitors.get(type);
  if (!monitor) {
    monitor = new ProcessingMonitor(async (ids, signal) => {
      const response = await fetch(`/api/accreditation/processing-status?type=${type}&ids=${ids.join(",")}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Status unavailable");
      const body = await response.json();
      if (!Array.isArray(body.documents)) throw new Error("Invalid status response");
      return body.documents;
    }, () => typeof document !== "undefined" && document.visibilityState === "visible" && navigator.onLine);
    monitors.set(type, monitor);
  }
  return monitor;
}
export function useProcessingStatuses(type: string, ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const monitor = processingMonitor(type);
  const subscribe = useCallback((listener: () => void) => monitor.subscribe(key ? key.split(",") : [], listener), [monitor, key]);
  return useSyncExternalStore(subscribe, () => monitor.rows, () => EMPTY_STATUSES);
}
export function ProcessingStatusSeed({ type, rows, error }: { type: string; rows: ProcessingStatus[]; error?: string }) {
  const monitor = processingMonitor(type);
  useEffect(() => { monitor.seed(rows); }, [monitor, rows]);
  useEffect(() => {
    const change = () => monitor.visibilityChanged();
    document.addEventListener("visibilitychange", change); window.addEventListener("online", change); window.addEventListener("offline", change);
    return () => { document.removeEventListener("visibilitychange", change); window.removeEventListener("online", change); window.removeEventListener("offline", change); };
  }, [monitor]);
  useProcessingStatuses(type, []);
  return <div className="flex items-center gap-3 text-xs text-muted">
    {monitor.error || (error && !Object.keys(monitor.rows).length) ? <p role="status">{monitor.error || error}</p> : null}
    <button type="button" className="text-brand underline" onClick={() => monitor.refresh()}>Refresh processing status</button>
  </div>;
}
export function ProcessingBadge({ sourceId, status, type }: { sourceId: string; status: string; type: string }) {
  const rows = useProcessingStatuses(type, [sourceId]);
  const row = rows[sourceId];
  const label = row?.ingestion_status ?? (["processing", "pending"].includes(status) ? "Uploaded—not queued" : status);
  return <span className={`badge ${label === "running" ? "border-brand/30 bg-brand-light text-brand" : label === "complete" || label === "ready" ? "badge-approved" : label === "failed" ? "badge-denied" : "badge-pending"}`}>{label === "running" ? "Processing" : label}</span>;
}
