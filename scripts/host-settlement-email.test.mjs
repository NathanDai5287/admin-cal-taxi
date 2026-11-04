import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";
import { createHash } from "node:crypto";

const source = await readFile(new URL("../lib/host-settlement-email.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "cjs" });
const today = "2026-11-03";

function fixture({ depositAmount = 300, refundDate = "2026-11-01", refundMethod = "Zelle", refund = null, failedPhoto = false, itemizedPdf = true, pdfStyle = null } = {}) {
  const settlement = { id: "settlement", revision: 1, depositAmount, refundDate, refundMethod, items: [
    { description: "Door casing and surrounding drywall repair", amount: 100 },
    { description: "Clogged toilet: clearing and cleaning", amount: 80 },
  ] };
  const order = { id: "order", clubName: "Test club", eventDate: "2026-11-01", updatedAt: "version", rentalPrice: 1000, snapshot: { contractSigners: [{ email: "renter@example.test" }] }, documents: [{ kind: "deposit_invoice", number: "DI-1", generatedAt: today }] };
  const deliveries = [];
  const payloads = [];
  const evidence = ["door-one.jpg", "door-two.jpg", "toilet.jpg"].map(filename => ({ filename, storage_path: filename, content_type: "image/jpeg" }));
  const db = {
    storage: { from: () => ({ download: async () => failedPhoto ? { error: new Error("Unavailable") } : { data: new Blob(["photo"]) } }) },
    from(table) {
      const filters = [];
      const rows = table === "hosting_deposit_payments" ? [{ amount: depositAmount }]
        : table === "hosting_finance_payments" ? [{ amount: 1000 }]
        : table === "hosting_damage_evidence" ? evidence : deliveries;
      const result = () => rows.filter(row => filters.every(([key, value]) => row[key] === value));
      const query = {
        select: () => query,
        eq: (key, value) => { if (table === "hosting_email_deliveries") filters.push([key, value]); return query; },
        is: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: result()[0] ?? null }),
        single: async () => ({ data: result()[0] }),
        insert: async row => { rows.push({ ...row, id: `delivery-${rows.length}`, status: "queued", attempted_at: null }); return {}; },
        then: resolve => Promise.resolve({ data: result() }).then(resolve),
      };
      return query;
    },
  };
  const modules = {
    "server-only": {},
    "node:crypto": { createHash },
    "./host-backend": { backendKey: () => "test", backendOrigin: () => "https://generator.example.test" },
    "./host-order-documents": { defaultDocuments: () => ({ payloads: { credit_memo: { original_invoice: "DI-1" } } }) },
    "./host-orders": { getOrderFresh: async () => order },
    "./host-event": { currentRevision: revisions => revisions[0], contractWasSent: () => true, eventToday: () => today },
    "./host-email": { hostingEmailConfig: async () => ({ from: "hosting@example.test", replyTo: "hosting@example.test" }), hostingTermsHash: () => "terms" },
    "./host-signing": { listSigning: async () => [{ id: "revision", recipients: [{ email: "renter@example.test" }] }] },
    "./host-email-template": { escapeEmail: value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
    "./host-format": { formatDateISO: value => value },
    "./host-payment-schedule": { orderPaymentSchedule: () => ({ eventEndDate: "2026-11-01" }) },
    "./host-settlement": { HOSTING_EVIDENCE_BUCKET: "evidence", loadDepositSettlement: async () => settlement },
    "./host-workflow": { loadWorkflow: async () => ({ refund }), workflowDb: () => db },
    "./reimbursements/supabase/admin": { createAdminClient: () => db },
  };
  const loaded = { exports: {} };
  const fetchPdf = async (_, options) => {
    payloads.push(JSON.parse(options.body));
    return new Response(`%PDF-${pdfStyle ?? "legacy"}`, { headers: { "content-type": "application/pdf", "x-deposit-settlement": itemizedPdf ? "itemized-v1" : "", ...(pdfStyle ? { "x-deposit-settlement-style": pdfStyle } : {}), "content-disposition": 'attachment; filename="credit.pdf"' } });
  };
  new Function("require", "module", "exports", "fetch", compiled.code)(name => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, loaded, loaded.exports, fetchPdf);
  return { prepare: message => loaded.exports.prepareHostingSettlementEmail({ orderId: order.id, settlementRevision: 1, message }), deliveries, payloads, setPdfStyle: style => { pdfStyle = style; } };
}

test("partial retention freezes an itemized PDF and every evidence photo without claiming payment", async () => {
  const { prepare, deliveries, payloads } = fixture();
  const [preview] = await prepare();
  assert.equal(payloads[0].amount, "120.00");
  assert.equal(payloads[0].deposit_amount, "300.00");
  assert.equal(payloads[0].original_invoice, "DI-1");
  assert.deepEqual(payloads[0].deductions.map(item => item.amount), ["100.00", "80.00"]);
  assert.deepEqual(preview.attachments, ["credit.pdf", "door-one.jpg", "door-two.jpg", "toilet.jpg"]);
  assert.match(preview.text, /We will return/);
  assert.doesNotMatch(preview.text, /was returned/);
  assert.equal(deliveries[0].payload.settlement.creditMemo.amount, 120);
});

test("full retention generates a zero-refund itemized PDF without refund details", async () => {
  const { prepare, payloads } = fixture({ depositAmount: 180, refundDate: null, refundMethod: "" });
  const [preview] = await prepare();
  assert.equal(payloads[0].amount, "0.00");
  assert.equal(payloads[0].refund_method, "No refund");
  assert.equal(preview.attachments[0], "credit.pdf");
  assert.match(preview.text, /no balance remains to return/);
});

test("partial refund review works without a planned method or date", async () => {
  const { prepare, payloads } = fixture({ refundDate: null, refundMethod: "" });
  const [preview] = await prepare();
  assert.equal(payloads[0].refund_method, "a payment method to be confirmed");
  assert.match(preview.text, /We will return the remaining \$120\.00\./);
  assert.doesNotMatch(preview.text, /via Zelle| by |was returned/);
  assert.equal(preview.attachments.length, 4);
});

test("legacy planned details do not become payment promises in the notice or credit memo", async () => {
  const { prepare, payloads } = fixture({ refundMethod: "Cash", refundDate: "2026-11-10" });
  const [preview] = await prepare();
  assert.match(preview.text, /We will return the remaining \$120\.00\./);
  assert.doesNotMatch(preview.text, /via Cash|by 2026-11-10/);
  assert.equal(payloads[0].refund_method, "a payment method to be confirmed");
});

test("payment wording uses the recorded refund instead of the planned return", async () => {
  const { prepare, payloads } = fixture({ refund: { amount: 120, date: "2026-11-02", method: "Cash" } });
  const [preview] = await prepare();
  assert.match(preview.text, /was returned via Cash on 2026-11-02/);
  assert.equal(payloads[0].refund_method, "Cash");
});

test("edited email creates an exact escaped preview with the same attachments and stable retries", async () => {
  const { prepare, deliveries } = fixture();
  const [original] = await prepare();
  const message = { subject: "Your deposit", text: "Hello <club>,\n\nRepairs: $180 & refund: $120." };
  const [edited] = await prepare(message);
  assert.notEqual(edited.id, original.id);
  assert.equal(edited.subject, message.subject);
  assert.equal(edited.text, message.text);
  assert.match(edited.html, /Hello &lt;club&gt;/);
  assert.deepEqual(edited.attachments, original.attachments);
  assert.equal((await prepare(message))[0].id, edited.id);
  assert.equal(deliveries.length, 2);
});

test("missing evidence prevents a sendable preview", async () => {
  const { prepare, deliveries } = fixture({ failedPhoto: true });
  await assert.rejects(prepare(), /could not be attached/);
  assert.equal(deliveries.length, 0);
});


test("a new PDF style refreshes an unattempted preview and keeps retries stable", async () => {
  const { prepare, deliveries, setPdfStyle } = fixture();
  const [original] = await prepare();
  const originalPayload = structuredClone(deliveries[0].payload);
  setPdfStyle("hierarchy-v1");
  const [updated] = await prepare();
  assert.notEqual(updated.id, original.id);
  assert.deepEqual(deliveries[0].payload, originalPayload);
  assert.notEqual(deliveries[1].payload.body.attachments[0].content, originalPayload.body.attachments[0].content);
  assert.equal((await prepare())[0].id, updated.id);
});

test("PDF style updates preserve sent and attempted legacy previews", async () => {
  for (const status of ["queued", "sending", "sent", "failed", "uncertain"]) {
    const { prepare, deliveries, setPdfStyle } = fixture();
    const [original] = await prepare();
    deliveries[0].status = status;
    deliveries[0].attempted_at = today;
    const originalPayload = structuredClone(deliveries[0].payload);
    setPdfStyle("hierarchy-v1");
    assert.equal((await prepare())[0].id, original.id);
    assert.deepEqual(deliveries[0].payload, originalPayload);
    assert.equal(deliveries.length, 1);
  }
});


test("a PDF service without itemization cannot produce a sendable settlement", async () => {
  const { prepare, deliveries } = fixture({ itemizedPdf: false });
  await assert.rejects(prepare(), /itemized settlement update/);
  assert.equal(deliveries.length, 0);
});
