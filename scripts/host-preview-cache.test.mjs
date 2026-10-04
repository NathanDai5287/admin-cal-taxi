import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["lib/host-preview-client.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { createHostingPreviewCache, createHostingDocumentCache } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

test("background loads and rapid clicks coalesce; changed scopes and failed requests can reload", async () => {
  const cache = createHostingPreviewCache(); let calls = 0; let finish;
  globalThis.fetch = async () => { calls++; await new Promise(resolve => { finish = resolve; }); return Response.json({ ok: true, data: [{ id: "frozen" }] }); };
  const first = cache.load("scope:reminder", { orderId: "order" });
  const second = cache.load("scope:reminder", { orderId: "order" });
  assert.equal(first, second); assert.equal(calls, 1); finish(); await first;
  assert.equal((await cache.load("scope:reminder", {}))[0].id, "frozen"); assert.equal(calls, 1);
  globalThis.fetch = async () => { calls++; return Response.json({ ok: false, error: "Try again" }); };
  await assert.rejects(cache.load("changed:reminder", {}), /Try again/);
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true, data: [] }); };
  await cache.load("changed:reminder", {}); assert.equal(calls, 3);
  cache.clear(); await cache.load("scope:reminder", {}); assert.equal(calls, 4);
});
test("PDF hover and click share normalized URLs, and object URLs are released on cleanup", async () => {
  globalThis.window = { location: { href: "https://admin.example.test/host/orders/order" } };
  const cache = createHostingDocumentCache(); let calls = 0;
  const originalRevoke = URL.revokeObjectURL; const revoked = [];
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke(url); };
  globalThis.fetch = async () => { calls++; return new Response("PDF bytes", { headers: { "Content-Type": "application/pdf" } }); };
  const first = cache.load("/api/host/document");
  assert.equal(first, cache.load("https://admin.example.test/api/host/document"));
  const blob = await first; assert(blob.startsWith("blob:")); assert.equal(cache.ready("/api/host/document"), blob); assert.equal(calls, 1);
  cache.clear(); assert.equal(cache.ready("/api/host/document"), undefined);
  assert.deepEqual(revoked, [blob]); URL.revokeObjectURL = originalRevoke;
});
