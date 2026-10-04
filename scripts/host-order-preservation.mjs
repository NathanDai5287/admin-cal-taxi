// Read-only proof of envelope identity, personal links, and approved PDF bytes.
// Baseline contains private data: keep it outside the repository.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const folder = (await fs.readFile(path.join(os.tmpdir(), "host-order-preservation-path.txt"), "utf8")).trim();
const baseline = JSON.parse(await fs.readFile(path.join(folder, "baseline.json"), "utf8"));
const orderId = baseline.order.order.id;
const headers = { "X-Admin-Key": process.env.HOST_BACKEND_KEY };
const origin = process.env.HOST_BACKEND_ORIGIN.replace(/\/$/, "");
async function get(suffix) { const response = await fetch(`${origin}/api/orders/${orderId}${suffix}`, { headers }); if (!response.ok) throw Error(`Preservation read failed (${response.status})`); return response; }
const order = await (await get("")).json();
const history = await (await get("/signing")).json();
assert.deepEqual(order.order.snapshot, baseline.order.order.snapshot, "Stored terms changed");
assert.deepEqual(order.order.documents, baseline.order.order.documents, "Stored documents changed");
for (const proof of baseline.proofs) {
  const revision = history.revisions.find(r => r.id === proof.revisionId);
  assert.ok(revision, "Existing signing revision missing");
  assert.equal(revision.envelope_id, proof.envelopeId, "Envelope changed");
  assert.notEqual(revision.state, "cancelled", "Existing signing request cancelled");
  const bytes = await (await get(`/signing/${proof.revisionId}/original.pdf`)).arrayBuffer();
  assert.equal(createHash("sha256").update(Buffer.from(bytes)).digest("hex"), proof.originalSha256, "Approved PDF changed");
  const links = revision.recipients.map(p => createHash("sha256").update(`${p.email}|${p.link}`).digest("hex"));
  assert.deepEqual(links, proof.linkHashes, "Personal signing links changed");
}
console.log(`Preserved ${baseline.proofs.length} existing signing revision(s), approved PDF bytes, personal links, stored terms, and documents.`);
