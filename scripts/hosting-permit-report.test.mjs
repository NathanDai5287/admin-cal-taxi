import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Exercise the report route and its real calculator with an isolated database.
const fixture = `
export const state = { reimbursed: false };
export async function getSessionProfile() { return { profile: { role: 'admin' } }; }
export async function loadAllPages(query) { return await query(0, 999); }
export function renderFinancialReportPdf() { throw Error('JSON test only'); }
export function createAdminClient() {
  return { from(table) {
    let rows = ({
      chapter_financial_settings: [{ chapter_name: 'Test', opening_cash: 1000, term_label: 'Fall', term_start: '2026-08-01', term_end: '2026-12-31' }],
      reimbursements: [{ category: 'socials', amount: 250, status: 'approved', reimbursed: state.reimbursed, reimbursed_at: state.reimbursed ? '2026-10-04T12:00:00Z' : null }],
      reimbursement_manual_expenses: [{ category: 'socials', amount: 20 }],
      hosting_finance_payments: [{ kind: 'fire_permit', amount: 125 }, { kind: 'revenue', amount: 1400 }],
      hosting_finance_orders: [{ planned_fire_permit: 125 }],
    })[table] ?? [];
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter(row => !(key in row) || row[key] === value); return query; },
      is() { return query; }, gte() { return query; }, lte() { return query; }, lt() { return query; },
      order() { return query; }, range() { return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0], error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    }; return query;
  } };
}
`;

async function loadRoute() {
  const result = await build({
    stdin: {
      contents: 'export { GET } from "./app/(admin)/finance/reports/financial/route.ts"; export { state } from "test-fixture";',
      resolveDir: process.cwd(), loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "database-double", setup(builder) {
      builder.onResolve({ filter: /^(test-fixture|@\/lib\/reimbursements\/(auth|supabase\/admin|load-all-pages|financial-report-pdf))$/ }, () => ({ path: "fixture", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: fixture, loader: "ts" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("cash report excludes hosting permit status before and after reimbursement", async () => {
  const { GET, state } = await loadRoute();
  const request = new Request("http://localhost/finance/reports/financial?format=json");
  const before = await (await GET(request)).json();
  state.reimbursed = true;
  const after = await (await GET(request)).json();
  // Assert the real report's totals below; the direct $20 expense stays counted.
  assert.equal(before.executiveSnapshot.totalExpenses, 20);
  assert.equal(after.executiveSnapshot.totalExpenses, 270);
  assert.equal(before.executiveSnapshot.totalIncome, 1400);
  assert.equal(after.executiveSnapshot.totalIncome, 1400);
  assert.equal(before.outstandingBalances.outstandingLiabilities, 250);
  assert.equal(after.outstandingBalances.outstandingLiabilities, 0);
});
