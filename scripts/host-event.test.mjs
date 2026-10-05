import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

const compiled = await build({ stdin: { contents: 'export * from "./lib/host-event"; export * from "./lib/host-email-template";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node" });
const { eventProgress, eventToday, hostingEmail, signerProgress } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const workflow = { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null };
test("invoice emails calculate calendar due dates across year boundaries and leap days", () => {
  for (const [kind, eventDate, dueDate] of [
    ["deposit_invoice", "2027-01-03", "December 27, 2026"],
    ["rental_invoice", "2028-02-27", "February 29, 2028"],
    ["rental_invoice", "2026-11-01", "November 3, 2026"],
  ]) {
    const message = hostingEmail({ kind, name: "everyone", organization: "Club", eventDate, replyTo: "host@example.test" });
    const due = `is due ${dueDate}${kind === "deposit_invoice" ? ", seven days before the event" : ""}.`;
    assert.ok(message.text.includes(due));
    assert.ok(message.html.includes(due));
  }
});
const revision = { id: "sig_test", revision: 1, state: "awaiting_signatures", created_at: "2026-10-01T12:00:00Z", envelope_id: "envelope_existing", recipients: [{ name: "First", email: "one@example.test", status: "NOT_SIGNED", link: "https://example.test/sign/one" }], signedCount: 0, totalCount: 1 };
test("existing pending envelopes are sent without recreating or manually tracking them", () => {
  assert.deepEqual(eventProgress("2026-10-16", [revision], workflow, "2026-10-04"), { stage: "sent", signed: 0, total: 1 });
});

test("signer icons distinguish individual delivery from another recipient and queued previews", () => {
  const fresh = { ...revision, created_at: "2026-10-05T12:00:00Z" };
  const person = fresh.recipients[0];
  const delivery = { revision_id: fresh.id, recipient: person.email, kind: "invitation", status: "sent" };
  const state = (rows, signer = person, current = fresh) => signerProgress(signer, current, { ...workflow, deliveries: rows }).state;
  assert.equal(state([]), "not_sent");
  assert.equal(state([{ ...delivery, status: "queued" }]), "not_sent");
  assert.equal(state([{ ...delivery, recipient: "other@example.test" }]), "not_sent");
  assert.equal(state([{ ...delivery, revision_id: "old_revision" }]), "not_sent");
  assert.equal(state([{ ...delivery, kind: "deposit_invoice" }]), "not_sent");
  assert.equal(state([{ ...delivery, recipient: person.email.toUpperCase() }]), "pending");
  assert.equal(state([{ ...delivery, kind: "reminder" }]), "pending");
  assert.equal(state([], { ...person, sentAt: "2026-10-05T12:00:00Z" }), "pending");
  assert.equal(state([], person, revision), "pending");
  for (const status of ["sending", "failed", "uncertain"]) assert.equal(state([{ ...delivery, status }]), "unconfirmed");
  assert.equal(state([{ ...delivery, status: "failed" }, delivery]), "pending");
  assert.equal(state([], { ...person, status: "SIGNED" }), "signed");
});
test("new links remain draft until sent; abandoned drafts do not become held", () => {
  const fresh = { ...revision, created_at: "2026-10-05T12:00:00Z" };
  assert.equal(eventProgress("2026-10-06", [fresh], workflow, "2026-10-07").stage, "draft");
  const emailed = { ...workflow, deliveries: [{ revision_id: fresh.id, kind: "invitation", status: "sent" }] };
  assert.equal(eventProgress("2026-10-06", [fresh], emailed, "2026-10-05").stage, "sent");
  assert.equal(eventProgress("2026-10-06", [fresh], emailed, "2026-10-07").stage, "held");
});
test("signed, held, cancelled, and replacement previews preserve the current revision", () => {
  const signed = { ...revision, state: "signed", signedCount: 1 };
  const preview = { ...revision, id: "sig_preview", revision: 2, state: "preview", envelope_id: null };
  assert.equal(eventProgress("2026-10-16", [signed, preview], workflow, "2026-10-04").stage, "signed");
  assert.equal(eventProgress("2026-10-16", [{ ...signed, state: "preparing_completed_copy" }, preview], workflow, "2026-10-04").stage, "signed");
  assert.equal(eventProgress("2026-10-16", [signed, preview], workflow, "2026-10-17").stage, "held");
  assert.equal(eventProgress("2026-10-16", [signed], { ...workflow, cancelledAt: "now" }, "2026-10-17").stage, "cancelled");
  assert.equal(eventProgress("2026-10-16", [revision], workflow, "2026-10-16").stage, "sent");
  assert.equal(eventToday(new Date("2026-10-17T05:00:00Z")), "2026-10-16");
});
test("email HTML escapes names and embeds only the intended personal link", () => {
  const email = hostingEmail({ kind: "reminder", name: '<script>alert("x")</script>', organization: "A & B", eventDate: "2026-10-16", link: "https://example.test/sign/one", replyTo: "host@example.test" });
  assert.ok(!email.html.includes("<script>")); assert.match(email.html, /A &amp; B/);
  assert.match(email.html, /https:\/\/example.test\/sign\/one/);
  assert.throws(() => hostingEmail({ kind: "invitation", name: "A", organization: "B", eventDate: "date", link: "javascript:alert(1)", replyTo: "host@example.test" }));
});
test("email claims are exclusive, retain frozen payloads, and stop ambiguous old retries; cancellation retains payments", async () => {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create table profiles(id uuid primary key); create table hosting_finance_orders(order_id text primary key,status text default 'confirmed',cancelled_at timestamptz,organization text,event_date date,planned_revenue numeric,planned_fire_permit numeric); create table hosting_finance_payments(id uuid,order_id text,amount numeric);");
  await db.exec(await readFile("supabase/migrations/20261006000000_hosting_event_email.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261006001000_hosting_forecast_atomic.sql", "utf8"));
  const id = "00000000-0000-4000-8000-000000000001";
  await db.query("insert into hosting_email_deliveries(id,request_key,order_id,kind,recipient,payload) values($1,'key','ord_test','invitation','one@example.test',$2)", [id, { html: "frozen" }]);
  assert.equal((await db.query("select claim_hosting_email($1) as claimed", [id])).rows[0].claimed, true);
  assert.equal((await db.query("select claim_hosting_email($1) as claimed", [id])).rows[0].claimed, false);
  await db.query("update hosting_email_deliveries set attempted_at=now()-interval '2 minutes' where id=$1", [id]);
  assert.equal((await db.query("select claim_hosting_email($1) as claimed", [id])).rows[0].claimed, true);
  assert.deepEqual((await db.query("select payload from hosting_email_deliveries where id=$1", [id])).rows[0].payload, { html: "frozen" });
  await db.query("update hosting_email_deliveries set first_attempted_at=now()-interval '24 hours',status='failed' where id=$1", [id]);
  assert.equal((await db.query("select claim_hosting_email($1) as claimed", [id])).rows[0].claimed, false);
  assert.equal((await db.query("select status from hosting_email_deliveries where id=$1", [id])).rows[0].status, "uncertain");
  await db.exec("insert into hosting_finance_orders(order_id,status) values('ord_test','confirmed'); insert into hosting_finance_payments values(gen_random_uuid(),'ord_test',100); insert into hosting_event_state(order_id,refund_amount,refund_date,refund_method) values('ord_test',50,'2026-10-01','Zelle'); select cancel_hosting_event('ord_test',null);");
  assert.equal((await db.query("select status from hosting_finance_orders")).rows[0].status, "cancelled");
  assert.equal((await db.query("select count(*)::int as n from hosting_finance_payments")).rows[0].n, 1);
  assert.equal((await db.query("select refund_amount::int as n from hosting_event_state")).rows[0].n, 50);
  assert.equal((await db.query("select has_table_privilege('authenticated','hosting_email_deliveries','select') as allowed")).rows[0].allowed, false);
  await db.exec("select ensure_hosting_forecast('ord_sent','Sample Club','2026-10-16',1400,125); select ensure_hosting_forecast('ord_sent','Other','2026-10-17',1500,150);");
  assert.equal((await db.query("select planned_revenue::int as n from hosting_finance_orders where order_id='ord_sent'")).rows[0].n, 1400);
  await db.exec("select cancel_hosting_event('ord_sent',null); select ensure_hosting_forecast('ord_sent','Sample Club','2026-10-16',1500,150); select cancel_hosting_event('ord_cancelled_draft',null); select ensure_hosting_forecast('ord_cancelled_draft','Sample Club','2026-10-16',1400,125);");
  assert.equal((await db.query("select status from hosting_finance_orders where order_id='ord_sent'")).rows[0].status, "cancelled");
  assert.equal((await db.query("select count(*)::int as n from hosting_finance_orders where order_id='ord_cancelled_draft'")).rows[0].n, 0);
  await db.close();
});
