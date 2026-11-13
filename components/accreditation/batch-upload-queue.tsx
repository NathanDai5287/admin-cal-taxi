"use client";

import { useMemo, useState } from "react";
import { processingMonitor, useProcessingStatuses } from "./processing-status";

import {
  MAX_PROCESSING_ATTEMPTS,
  processingRetryDelayMs,
  type BatchProcessResult,
} from "@/lib/accreditation/batch";

export type BatchQueuePhase = "queued" | "uploading" | "embedding" | "waiting" | "ready" | "failed";

export type BatchQueueItem = {
  localId: string;
  name: string;
  sourceId?: string;
  phase: BatchQueuePhase;
  message: string;
  completed: number;
  total: number;
  attempt: number;
};

export function useBatchUploadQueue(type: "policy" | "accreditation") {
  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const activeIds = useMemo(() => items
    .filter((item) => item.sourceId && item.phase === "embedding")
    .map((item) => item.sourceId!)
    .sort()
    .join(","), [items]);

  const rows = useProcessingStatuses(type, activeIds ? activeIds.split(",") : []);
  function updateItem(localId: string, patch: Partial<BatchQueueItem>) {
    const sourceId = patch.sourceId ?? items.find(item => item.localId === localId)?.sourceId;
    if (sourceId && patch.phase === "embedding") processingMonitor(type).refresh([sourceId]);
    setItems(current => current.map(item => item.localId === localId ? { ...item, ...patch } : item));
  }
  const displayItems: BatchQueueItem[] = items.map(item => {
      const row = item.sourceId ? rows[item.sourceId] : undefined;
      if (!row || item.phase !== "embedding") return item;
      return { ...item, completed: row.processing_completed ?? 0, total: row.processing_total ?? 0,
        message: row.ingestion_message ?? item.message,
        phase: row.ingestion_status === "complete" ? "ready" : ["paused", "failed", "cancelled"].includes(row.ingestion_status ?? "") ? "failed" : item.phase };
    });

  return { items: displayItems, setItems, updateItem };
}

async function waitWithCountdown(milliseconds: number, onTick: (seconds: number) => void) {
  let remaining = milliseconds;
  while (remaining > 0) {
    onTick(Math.ceil(remaining / 1_000));
    const duration = Math.min(1_000, remaining);
    await new Promise((resolve) => window.setTimeout(resolve, duration));
    remaining -= duration;
  }
}

export async function processQueuedDocument(options: {
  localId: string;
  sourceId: string;
  update: (localId: string, patch: Partial<BatchQueueItem>) => void;
  process: (sourceId: string) => Promise<BatchProcessResult>;
  refresh: () => void;
}) {
  const { localId, sourceId, update, process, refresh } = options;
  for (let attempt = 0; attempt < MAX_PROCESSING_ATTEMPTS; attempt++) {
    update(localId, { phase: "embedding", message: attempt ? `Embedding retry ${attempt + 1} of ${MAX_PROCESSING_ATTEMPTS}` : "Extracting and embedding", attempt: attempt + 1, completed: 0, total: 0 });
    let result: BatchProcessResult;
    try {
      result = await process(sourceId);
    } catch {
      update(localId, { phase: "failed", message: "The processing request was interrupted. Retry this document from the library." });
      refresh();
      return;
    }
    if (result.ok) {
      update(localId, { sourceId, phase: result.queued ? "embedding" : "ready", message: result.message });
      return;
    }
    if (!result.retryable || attempt === MAX_PROCESSING_ATTEMPTS - 1) {
      update(localId, { phase: "failed", message: result.retryable ? `Gemini remained unavailable after ${MAX_PROCESSING_ATTEMPTS} attempts.` : result.message });
      return;
    }
    const delay = processingRetryDelayMs(attempt);
    await waitWithCountdown(delay, (seconds) => update(localId, { phase: "waiting", message: `Rate limited — retrying this document in ${seconds}s` }));
  }
}

const phaseLabel: Record<BatchQueuePhase, string> = {
  queued: "Queued",
  uploading: "Uploading",
  embedding: "Embedding",
  waiting: "Waiting",
  ready: "Ready",
  failed: "Failed",
};

export function BatchUploadQueue({ items }: { items: BatchQueueItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2 border-t border-rule pt-4" aria-live="polite">
      <div className="flex items-center justify-between text-xs font-bold"><span>Batch progress</span><span>{items.filter((item) => item.phase === "ready").length}/{items.length} complete</span></div>
      <ul className="space-y-2">
        {items.map((item) => {
          const percent = item.total ? Math.round((item.completed / item.total) * 100) : item.phase === "ready" ? 100 : 0;
          return <li key={item.localId} className="border border-rule bg-canvas p-3">
            <div className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0 truncate font-bold text-ink">{item.name}</span><span className={`badge ${item.phase === "ready" ? "badge-approved" : item.phase === "failed" ? "badge-denied" : "badge-pending"}`}>{phaseLabel[item.phase]}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden bg-rule"><div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} /></div>
            <p className="mt-1 text-xs text-muted">{item.message}{item.total ? ` · ${item.completed}/${item.total} passages` : ""}</p>
          </li>;
        })}
      </ul>
    </div>
  );
}
