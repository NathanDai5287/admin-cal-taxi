"use client";

import { useEffect, useMemo, useState } from "react";

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

type ProgressRow = {
  id: string;
  processing_completed?: number;
  processing_total?: number;
  processing_attempts?: number;
};

export function useBatchUploadQueue(type: "policy" | "accreditation") {
  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const activeIds = useMemo(() => items
    .filter((item) => item.sourceId && item.phase === "embedding")
    .map((item) => item.sourceId!)
    .sort()
    .join(","), [items]);

  function updateItem(localId: string, patch: Partial<BatchQueueItem>) {
    setItems((current) => current.map((item) => item.localId === localId ? { ...item, ...patch } : item));
  }

  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/accreditation/processing-status?type=${type}&ids=${encodeURIComponent(activeIds)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body = await response.json() as { documents?: ProgressRow[] };
        const rows = new Map((body.documents ?? []).map((row) => [row.id, row]));
        setItems((current) => current.map((item) => {
          if (!item.sourceId || item.phase !== "embedding") return item;
          const row = rows.get(item.sourceId);
          if (!row) return item;
          const completed = Number(row.processing_completed ?? 0);
          const total = Number(row.processing_total ?? 0);
          return { ...item, completed, total, attempt: Math.max(item.attempt, Number(row.processing_attempts ?? 0)) };
        }));
      } catch {
        // The processing action remains authoritative; a missed poll is harmless.
      }
    };
    void poll();
    const interval = window.setInterval(poll, 1_500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeIds, type]);

  return { items, setItems, updateItem };
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
    refresh();
    if (result.ok) {
      update(localId, { phase: "ready", message: result.message });
      return;
    }
    if (!result.retryable || attempt === MAX_PROCESSING_ATTEMPTS - 1) {
      update(localId, { phase: "failed", message: result.retryable ? "Gemini remained unavailable after four attempts." : result.message });
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
