import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const mocks = {
  "next/cache": "export const revalidatePath = () => {};",
  "next/server": "export const after = () => {};",
  "@/lib/reimbursements/send-decision-email": "export const sendDecisionEmail = () => {};",
  "@/lib/reimbursements/auth": `
    export const requireAppAccess = async () => ({ userId: 'treasurer' });
    export async function requireAdmin() {
      if (globalThis.reimbursementRole !== 'admin') throw new Error('Administrator access is required.');
      return { userId: 'admin' };
    }
  `,
  "@/lib/reimbursements/supabase/admin": "export const createAdminClient = () => { if (globalThis.manualExpenseClient) return globalThis.manualExpenseClient; throw new Error('Unexpected privileged database access'); };",
  "@/app/(admin)/finance/planning/actions": "export const setExpenseCategoryCompleted = () => { throw new Error('Unexpected category change'); };",
};

async function loadActions(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "management-access", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const review = await loadActions("app/(admin)/finance/review/actions.ts");
const payments = await loadActions("app/(admin)/finance/accounts/payable/actions.ts");
const reimbursementId = "11111111-1111-4111-8111-111111111111";

for (const role of ["treasurer", "brother", "associate_member", "member"]) {
  test(`${role} cannot approve, edit, or record reimbursement payments`, async () => {
    globalThis.reimbursementRole = role;
    const form = new FormData();
    form.set("id", reimbursementId);
    form.set("merchant", "Supplies");
    form.set("category", "house");
    await assert.rejects(review.setReimbursementStatus(reimbursementId, { status: "approved", note: "" }), /Administrator access/);
    await assert.rejects(review.updateCategory(form), /Administrator access/);
    await assert.rejects(payments.setReimbursementPaid(reimbursementId, true), /Administrator access/);
    await assert.rejects(payments.markReimbursementsPaid([reimbursementId]), /Administrator access/);
  });
}

test("administrators pass the management guard and reach input validation", async () => {
  globalThis.reimbursementRole = "admin";
  assert.equal((await review.setReimbursementStatus("invalid", { status: "approved", note: "" })).ok, false);
  assert.equal((await payments.setReimbursementPaid("invalid", true)).ok, false);
});


const activity = await loadActions("app/(admin)/finance/accounts/activity/actions.ts");

for (const receiptPath of ["manual/treasurer/receipt.png", "claim.png", "mcp/claim.png"]) {
  test(`deleting a manual expense only removes manual receipt storage: ${receiptPath}`, async () => {
    const removed = [];
    const query = { delete: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: { receipt_path: receiptPath }, error: null }) };
    globalThis.manualExpenseClient = {
      from: () => query,
      storage: { from: () => ({ remove: async paths => { removed.push(...paths); return { error: null }; } }) },
    };
    const form = new FormData();
    form.set("id", reimbursementId);
    assert.equal((await activity.deleteManualExpense(form)).ok, true);
    assert.deepEqual(removed, receiptPath.startsWith("manual/") ? [receiptPath] : []);
    delete globalThis.manualExpenseClient;
  });
}
