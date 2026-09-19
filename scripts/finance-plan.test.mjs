import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const categories = [
  "administration",
  "rush",
  "socials",
  "education",
  "philanthropy",
  "brother_bonding",
  "retreat",
  "house",
  "miscellaneous_fees",
].map((category) => [category, category]);

async function loadCalculator() {
  const source = await readFile(new URL("../lib/finance/plan-vs-actual.ts", import.meta.url), "utf8");
  const standalone = source.replace(
    /import \{ categories, type ReimbursementCategory \} from [^;]+;/,
    `const categories = ${JSON.stringify(categories)}; type ReimbursementCategory = string;`,
  );
  const compiled = ts.transpileModule(standalone, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

function baseInput() {
  return {
    categoryBudgets: { house: 1000 },
    receivables: [],
    duesPayments: [],
    incomeEntries: [],
    paidReimbursements: [],
    directExpenses: [],
    hostingOrders: [],
    hostingPayments: [],
  };
}

test("dues payments change actual income without changing planned income", async () => {
  const { buildPlanVsActual } = await loadCalculator();
  const before = buildPlanVsActual({ ...baseInput(), receivables: [{ amountAssessed: 600, waived: false }] });
  const after = buildPlanVsActual({ ...baseInput(), receivables: [{ amountAssessed: 600, waived: false }], duesPayments: [{ amount: 250 }] });

  assert.equal(before.plannedIncome, 600);
  assert.equal(after.plannedIncome, 600);
  assert.equal(after.actualIncome, 250);
});

test("waivers and hosting cancellations remove planned values only", async () => {
  const { buildPlanVsActual } = await loadCalculator();
  const summary = buildPlanVsActual({
    ...baseInput(),
    receivables: [{ amountAssessed: 600, waived: true }],
    duesPayments: [{ amount: 100 }],
    hostingOrders: [{ plannedRevenue: 2000, plannedFirePermit: 125, status: "cancelled" }],
    hostingPayments: [{ amount: 500, kind: "revenue" }, { amount: 125, kind: "fire_permit" }],
  });

  assert.equal(summary.plannedIncome, 0);
  assert.equal(summary.actualIncome, 600);
  assert.equal(summary.plannedExpenses, 1000);
  assert.equal(summary.actualExpenses, 125);
});

test("legacy manual dues do not double count assigned dues", async () => {
  const { buildPlanVsActual } = await loadCalculator();
  const summary = buildPlanVsActual({
    ...baseInput(),
    receivables: [{ amountAssessed: 600, waived: false }],
    duesPayments: [{ amount: 600 }],
    incomeEntries: [
      { amount: 600, kind: "income", source: "active_member_dues" },
      { amount: 75, kind: "income", source: "alumni_donations" },
    ],
  });

  assert.equal(summary.actualIncome, 675);
  assert.equal(summary.excludedLegacyDues.length, 1);
});

test("hosting confirmation storage is unique and cancellation keeps payments", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8");
  const actions = await readFile(new URL("../app/(admin)/host/orders/actions.ts", import.meta.url), "utf8");

  assert.match(migration, /order_id text primary key/);
  assert.match(actions, /if \(existing\.data\)/);
  assert.match(actions, /cancelHostingContractAction/);
  assert.doesNotMatch(actions, /hosting_finance_payments[\s\S]*\.delete\(\)/);
});

test("dated payments are separate from planned charge dates", async () => {
  const planningPage = await readFile(new URL("../app/(admin)/finance/planning/page.tsx", import.meta.url), "utf8");

  assert.match(planningPage, /chapter_dues_payment_events/);
  assert.match(planningPage, /\.gte\("paid_date", termStart\)/);
  assert.match(planningPage, /\.gte\("reimbursed_at",/);
  assert.doesNotMatch(planningPage, /reimbursements[^\n]+\.gte\("submitted_at"/);
});

test("hosting writes enforce source retention and payment integrity", async () => {
  const [migration, actions] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/host/orders/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(actions, /finance history and cannot be deleted/);
  assert.match(actions, /record_hosting_payment/);
  assert.match(actions, /reverseHostingPaymentAction/);
  assert.match(migration, /request_id uuid not null unique/);
  assert.match(migration, /finance_order\.status <> 'confirmed'/);
  assert.match(migration, /recorded_total \+ p_amount > payment_limit/);
  const confirmation = actions.slice(
    actions.indexOf("export async function confirmHostingContractAction"),
    actions.indexOf("export async function cancelHostingContractAction"),
  );
  const cancellation = actions.slice(
    actions.indexOf("export async function cancelHostingContractAction"),
    actions.indexOf("const hostingPaymentSchema"),
  );
  assert.doesNotMatch(confirmation, /updateOrder\(/);
  assert.doesNotMatch(cancellation, /updateOrder\(/);
});

test("waived dues are excluded from outstanding reports", async () => {
  const [migration, report] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/reports/financial/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /where waived_at is null/);
  assert.match(report, /\.is\("waived_at", null\)/);
});

test("paid charge edits cannot change recorded cash", async () => {
  const [actions, migration, mcpMigration] = await Promise.all([
    readFile(new URL("../app/(admin)/finance/accounts/receivable/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260920000000_mcp_admin_writes.sql", import.meta.url), "utf8"),
  ]);

  assert.match(actions, /wasPaid && parsed\.data\.amountOwed !== currentAssessed/);
  assert.match(actions, /amount_paid: currentPaid/);
  assert.match(mcpMigration, /when 'update_charge'/);
  assert.match(migration, /create trigger chapter_receivables_protect_paid_amount/);
  assert.match(migration, /A paid charge amount cannot be changed/);
});
