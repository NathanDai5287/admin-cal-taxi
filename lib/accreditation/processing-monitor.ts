export type ProcessingStatus = {
  id: string; status?: string; active: boolean;
  ingestion_status?: string; ingestion_message?: string;
  ingestion_job?: { id: string; status: string; stage: string; next_retry_at?: string } | null;
  processing_completed?: number; processing_total?: number; processing_attempts?: number;
};
export type StatusMap = Record<string, ProcessingStatus>;
export const EMPTY_STATUSES: StatusMap = {};

// One monitor per document type, shared by library rows and the upload queue.
export class ProcessingMonitor {
  rows: StatusMap = EMPTY_STATUSES;
  error = "";
  private listeners = new Set<() => void>();
  private interests = new Map<string, number>();
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private due = new Map<string, number>();
  private failures = 0;
  private forced = new Set<string>();
  private revisions = new Map<string, number>();
  private request: (ids: string[], signal: AbortSignal) => Promise<ProcessingStatus[]>;
  private available: () => boolean;
  constructor(request: (ids: string[], signal: AbortSignal) => Promise<ProcessingStatus[]>, available = () => true) { this.request = request; this.available = available; }
  private emit() { for (const listener of this.listeners) listener(); }
  seed(rows: ProcessingStatus[]) {
    const now = Date.now();
    this.rows = { ...this.rows, ...Object.fromEntries(rows.map(row => [row.id, row])) };
    for (const row of rows) { this.due.set(row.id, this.next(row, now)); this.forced.delete(row.id); this.revisions.set(row.id, (this.revisions.get(row.id) ?? 0) + 1); }
    this.emit(); this.schedule();
  }
  subscribe(ids: string[], listener: () => void) {
    this.listeners.add(listener);
    for (const id of ids) {
      this.interests.set(id, (this.interests.get(id) ?? 0) + 1);
      if (!this.rows[id]) { this.forced.add(id); this.due.set(id, Date.now()); }
    }
    this.schedule();
    return () => {
      this.listeners.delete(listener);
      for (const id of ids) {
        const n = (this.interests.get(id) ?? 1) - 1;
        if (n) this.interests.set(id, n); else { this.interests.delete(id); this.forced.delete(id); }
      }
      if (!this.interests.size) { this.controller?.abort(); this.controller = undefined; }
      this.schedule();
    };
  }
  refresh(ids = [...this.interests.keys()]) {
    for (const id of ids) { this.forced.add(id); this.due.set(id, Date.now()); this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1); }
    this.schedule();
  }
  visibilityChanged() {
    if (!this.available()) { clearTimeout(this.timer); this.controller?.abort(); }
    else this.refresh([...this.interests.keys()].filter(id => this.rows[id]?.active));
  }
  private next(row: ProcessingStatus, now = Date.now()) {
    return row.active ? Math.max(now + 15_000, row.ingestion_status === "waiting" ? Date.parse(row.ingestion_job?.next_retry_at ?? "") || 0 : 0) : Infinity;
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.controller || !this.available()) return;
    const times = [...this.interests.keys()].filter(id => this.rows[id]?.active || this.forced.has(id)).map(id => this.due.get(id) ?? Date.now() + 15_000);
    if (!times.length) return;
    this.timer = setTimeout(() => void this.poll(), Math.max(0, Math.min(...times) - Date.now()));
  }
  private async poll() {
    if (!this.available() || this.controller) return;
    const ids = [...this.interests.keys()].filter(id => (this.rows[id]?.active || this.forced.has(id)) && (this.due.get(id) ?? 0) <= Date.now()).slice(0, 20);
    if (!ids.length) { this.schedule(); return; }
    const controller = new AbortController(); this.controller = controller;
    const revisions = new Map(ids.map(id => [id, this.revisions.get(id)]));
    try {
      const rows = await this.request(ids, controller.signal);
      if (controller.signal.aborted) return;
      const next = { ...this.rows };
      const now = Date.now();
      for (const id of ids) {
        if (!this.interests.has(id) || revisions.get(id) !== this.revisions.get(id)) continue;
        const row = rows.find(r => r.id === id) ?? { id, active: false };
        next[id] = row; this.due.set(id, this.next(row, now)); this.forced.delete(id);
      }
      this.rows = next; this.error = ""; this.failures = 0; this.emit();
    } catch {
      if (!controller.signal.aborted) {
        this.error = "Status unavailable. Progress is saved; retrying shortly.";
        const delay = Math.min(120_000, 30_000 * 2 ** this.failures++);
        for (const id of ids) this.due.set(id, Date.now() + delay);
        this.rows = { ...this.rows }; this.emit();
      }
    } finally {
      if (this.controller === controller) this.controller = undefined;
      this.schedule();
    }
  }
}
