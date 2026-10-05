import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const result = await build({ stdin: { contents: `export { GET as click, HEAD as clickHead } from "./app/api/email-tracking/[token]/click/route"; export { GET as open, HEAD as openHead } from "./app/api/email-tracking/[token]/open/route"; export * from "./lib/email-tracking"; export { trackedLink } from "./lib/email-tracking-links"; export { sendInviteEmails } from "./lib/reimbursements/send-invite-email";`, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [{ name: "server-only", setup(build) {
  build.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
  build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
} }] });
const output = new URL("../node_modules/.email-tracking-test.mjs", import.meta.url);
await writeFile(output, result.outputFiles[0].text);
const tracking = await import(output.href);
await unlink(output);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
process.env.SUPABASE_SECRET_KEY = "test-db-key";
process.env.EMAIL_TRACKING_SECRET = "stable-test-signing-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://admin.example.test";
const token = "445b5198-5e81-42da-9ce7-9b7de026a91b";
const context = { params: Promise.resolve({ token }) };

test("preparation persists one token across retries and records provider acceptance", async () => {
  let stored; const updates = [];
  globalThis.fetch = async (request, init) => {
    const url = new URL(request); const body = init?.body && JSON.parse(init.body);
    if (init?.method === "POST") { stored ??= { ...body, id: "message-id", token }; return new Response(null, { status: 201 }); }
    if (init?.method === "PATCH") { updates.push(body); return new Response(null, { status: 204 }); }
    assert.match(url.pathname, /email_tracking_messages/);
    return Response.json(stored);
  };
  const body = { subject: "Invitation", html: '<a href="https://example.test/sign">Sign</a>', text: "https://example.test/sign" };
  const message = { key: "invite/one", kind: "invite", recipient: "one@example.test" };
  const first = await tracking.prepareTrackedEmail(body, message);
  const second = await tracking.prepareTrackedEmail(body, message);
  assert.deepEqual(first, second);
  assert.match(first.body.html, /email-tracking/);
  await tracking.recordEmailProvider(first.id, "provider-id");
  assert.equal(updates[0].provider_id, "provider-id");
  assert.ok(updates[0].sent_at);
});

test("public endpoints record opens and visits; HEAD requests do not record events", async () => {
  const events = [];
  globalThis.fetch = async (_request, init) => {
    if (init?.method === "POST") { events.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    return Response.json({ id: "message-id" });
  };
  const destination = "https://example.test/sign?secret=one&step=two";
  const link = tracking.trackedLink(tracking.trackingAddress(token), destination);
  const response = await tracking.click(new Request(link), context);
  assert.equal(response.status, 302); assert.equal(response.headers.get("location"), destination);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const pixel = await tracking.open(new Request("https://admin.example.test/open"), context);
  assert.equal(pixel.headers.get("content-type"), "image/gif");
  assert.deepEqual(events.map(event => event.kind), ["clicked", "opened"]);
  tracking.clickHead(); tracking.openHead(); assert.equal(events.length, 2);
  const tampered = new URL(link); tampered.searchParams.set("url", "https://attacker.example.test");
  assert.equal((await tracking.click(new Request(tampered), context)).status, 400);
  assert.equal(events.length, 2);
});

test("database failure does not stop a valid email link or the tracking image", async () => {
  globalThis.fetch = async () => Response.json({ message: "Unavailable" }, { status: 503 });
  const previousError = console.error; console.error = () => {};
  try {
    const destination = "https://example.test/sign";
    const response = await tracking.click(new Request(tracking.trackedLink(tracking.trackingAddress(token), destination)), context);
    assert.equal(response.headers.get("location"), destination);
    assert.equal((await tracking.open(new Request("https://admin.example.test/open"), context)).status, 200);
  } finally { console.error = previousError; }
});

test("migration denies browser roles and validates recorded event types", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(await readFile(new URL("../supabase/migrations/20261007000000_email_tracking.sql", import.meta.url), "utf8"));
    const result = await db.query("insert into email_tracking_messages(message_key,kind,recipient,subject) values ('one','invite','one@example.test','Invitation') returning id");
    const id = result.rows[0].id;
    await db.query("insert into email_tracking_events(message_id,kind) values ($1,'opened')", [id]);
    await assert.rejects(db.query("insert into email_tracking_events(message_id,kind) values ($1,'clicked')", [id]), /check constraint/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from email_tracking_messages"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(db.query("select * from email_tracking_events"), /permission denied/);
  } finally { await db.close(); }
});


test("the invitation sender sends tracked HTML and plain text through Resend", async () => {
  process.env.RESEND_API_KEY = "re_test_only";
  let sent; let stored; let provider;
  globalThis.fetch = async (request, init) => {
    const url = String(request); const body = init?.body && JSON.parse(init.body);
    if (url.startsWith("https://api.resend.com/")) { sent = body; return Response.json({ id: "invitation-provider" }); }
    if (init?.method === "POST") { stored = { ...body, id: "invitation-id", token }; return new Response(null, { status: 201 }); }
    if (init?.method === "PATCH") { provider = body.provider_id; return new Response(null, { status: 204 }); }
    return Response.json(stored);
  };
  await tracking.sendInviteEmails(["one@example.test"], "admin", "request-one");
  assert.equal(sent.to, "one@example.test");
  assert.equal((sent.html.match(/\/click\?/g) || []).length, 2);
  assert.equal((sent.text.match(/\/click\?/g) || []).length, 2);
  assert.match(sent.html, /\/open/);
  assert.equal(provider, "invitation-provider");
});


test("pending setup preserves email sending without database access", async () => {
  const secret = process.env.EMAIL_TRACKING_SECRET;
  delete process.env.EMAIL_TRACKING_SECRET;
  process.env.RESEND_API_KEY = "re_test_only";
  let sent;
  globalThis.fetch = async (request, init) => {
    assert.ok(String(request).startsWith("https://api.resend.com/"));
    sent = JSON.parse(init.body);
    return Response.json({ id: "untracked-provider" });
  };
  try {
    const body = { subject: "Invitation", html: '<a href="https://example.test/sign">Sign</a>', text: "https://example.test/sign" };
    const result = await tracking.prepareTrackedEmail(body, { key: "invite/pending", kind: "invite", recipient: "one@example.test" });
    assert.equal(result.id, null);
    assert.equal(result.body, body);
    assert.deepEqual(await tracking.loadEmailActivity(), []);
    await tracking.recordEmailProvider(result.id, "untracked-provider");
    await tracking.sendInviteEmails(["one@example.test"], "admin", "pending-setup");
    assert.ok(sent.html.includes("href="));
    assert.ok(!sent.html.includes("/email-tracking/"));
    assert.ok(!sent.text.includes("/email-tracking/"));
  } finally { process.env.EMAIL_TRACKING_SECRET = secret; }
});
