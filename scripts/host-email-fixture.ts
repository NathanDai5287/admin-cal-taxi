// In-memory transports for safety tests. Never imported by the application.
export const state = {
  order: { id: "ord_test", updatedAt: "2026-10-01T12:00:00Z", clubName: "Sample Club", eventDate: "2026-10-16", rentalPrice: 1400, depositAmount: 300, snapshot: { contractSigners: [{ email: "one@example.test" }, { email: "two@example.test" }] }, documents: [], statusOverride: null },
  revision: { id: "sig_test", order_id: "ord_test", revision: 1, state: "awaiting_signatures", envelope_id: "envelope_existing", created_at: "2026-10-01T12:00:00Z", signedCount: 0, totalCount: 2, files: { original: true, completed: false, audit: false }, recipients: [{ name: "One", email: "one@example.test", status: "NOT_SIGNED", link: "https://example.test/sign/one" }, { name: "Two", email: "two@example.test", status: "NOT_SIGNED", link: "https://example.test/sign/two" }] },
  cancelled: false, syncs: 0, forecasts: 0, files: 0, rows: [] as Record<string, unknown>[], deposits: [] as Record<string, unknown>[],
};
export async function getOrderFresh() { return structuredClone(state.order); }
export async function listSigning() { return [structuredClone(state.revision)]; }
export async function syncSigning() { state.syncs++; return structuredClone(state.revision); }
export async function signingFile() { state.files++; return new Response("exact approved PDF bytes"); }
export async function prepareSigning() { throw Error("Envelope creation forbidden in email workflow"); }
export async function createSigningLinks() { throw Error("Envelope replacement forbidden in email workflow"); }
export function backendOrigin() { return "https://backend.example.test"; }
export function backendKey() { return "test-key"; }
export async function loadWorkflow() { return { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: state.cancelled ? "now" : null, refund: null, deliveries: state.rows }; }
export async function registerSigning() {}
export async function ensureHostingForecast() { state.forecasts++; }
export function createAdminClient() { return workflowDb(); }
export function workflowDb() {
  return {
    from(table: string) {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let mode = "read"; let patch: Record<string, unknown> = {}; let inserts: Record<string, unknown>[] = [];
      const result = () => {
        if (table === "hosting_finance_payments") return { data: [], error: null };
        if (table === "hosting_deposit_payments") return { data: state.deposits.filter(row => filters.every(f => f(row))), error: null };
        if (mode === "upsert") {
          for (const insert of inserts) if (!state.rows.some(r => r.request_key === insert.request_key)) state.rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), attempted_at: null, status: "queued", ...insert });
          return { data: null, error: null };
        }
        const rows = state.rows.filter(r => filters.every(f => f(r)));
        if (mode === "update") rows.forEach(row => Object.assign(row, patch));
        return { data: structuredClone(rows), error: null };
      };
      const chain = {
        select() { return chain; }, order() { return chain; },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return chain; },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return chain; },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return chain; },
        upsert(value: Record<string, unknown> | Record<string, unknown>[]) { mode = "upsert"; inserts = Array.isArray(value) ? value : [value]; return chain; },
        update(value: Record<string, unknown>) { mode = "update"; patch = value; return chain; },
        async single() { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then(resolve: (r: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return chain;
    },
    async rpc(_name: string, input: { p_id: string }) { const row = state.rows.find(r => r.id === input.p_id); if (!row || row.status === "sent") return { data: false, error: null }; row.status = "sending"; return { data: true, error: null }; },
  };
}

export async function prepareTrackedEmail<T>(body: T) { return { id: "tracking-fixture", body }; }
export async function recordEmailProvider() {}
