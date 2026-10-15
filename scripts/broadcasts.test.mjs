import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { parseRecipients, renderBroadcast } from "../lib/mailing-list/broadcast.ts";

const bundle = await build({ entryPoints: ["lib/mailing-list/store.ts", "lib/mcp/mailing-list.ts", "app/(admin)/mailing-list/broadcast-actions.ts", "lib/nu-news/publication.ts", "lib/mailing-list/analytics.ts"], outdir: "unused", bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "broadcast-boundaries", setup(b) {
  b.onResolve({ filter: /^\.\/store$/ }, (args) => args.importer.replaceAll("\\", "/").endsWith("nu-news/publication.ts") ? { path: "@/lib/nu-news/store", namespace: "mock" } : undefined);
  b.onResolve({ filter: /^(server-only|resend|next\/cache|@\/lib\/reimbursements\/(supabase\/admin|auth)|@\/lib\/nu-news\/store)$/ }, ({ path }) => ({ path, namespace: "mock" }));
  b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "server-only" ? "" : path === "resend" ? "export class Resend { constructor() { return globalThis.broadcastTest.provider; } }" : path === "next/cache" ? "export const revalidatePath = () => {};" : path.endsWith("/auth") ? "export async function requireAppAccess(app, level) { if (!globalThis.broadcastTest.allowed) throw new Error('Access denied'); return {}; }" : path.endsWith("/store") ? "export async function loadIssue() { return globalThis.broadcastTest.issue; }" : "export function createAdminClient() { globalThis.broadcastTest.dbCalls++; return globalThis.broadcastTest.db; }" }));
} }] });
const imported = [];
for (const output of bundle.outputFiles) imported.push(await import(`data:text/javascript;base64,${Buffer.from(output.text).toString("base64")}`));
const [store, mcp, actions, publication, analytics] = imported;
const id = "778ed178-cd4b-4f39-8fe7-44f81e52a8ec", listId = "9948aa45-71c7-4225-9cf4-5546977bd72c";
function fixture(status = "ready") {
  process.env.RESEND_API_KEY = "test"; process.env.RESEND_FROM_EMAIL = "Theta Xi <news@cal.taxi>";
  const row = { id, name: "October", list_id: listId, newsletter_id: null, subject: "October news", body: "Hello brothers", reply_to: "secretary@example.com", postal_address: "Example address", updated_at: "v1", status, sender: process.env.RESEND_FROM_EMAIL, resend_id: "remote", segment_id: "segment", import_id: "import", recipient_count: 800, error: null };
  const group = { id: listId, name: "Friends", recipients: Array.from({ length: 800 }, (_, i) => ({ email: `person${i}@example.com`, first_name: "", last_name: "" })) };
  const s = globalThis.broadcastTest = { row, group, allowed: true, dbCalls: 0, sendCalls: 0, createCalls: 0, importCalls: 0, issue: null, public: false, failSend: false, failImport: false, remoteChanged: false };
  let version = 1;
  s.db = { from(table) {
    let operation = "select", value, filters = [];
    const q = { select: () => q, order: () => q, limit: () => q, range: () => q, eq: (k, v) => { filters.push([k, v]); return q; }, update: (v) => { operation = "update"; value = v; return q; }, insert: (v) => { operation = "insert"; value = v; return q; }, upsert: (v) => { operation = "upsert"; value = v; return q; },
      single: async () => execute(true), maybeSingle: async () => execute(true), then: (resolve) => Promise.resolve(execute(false)).then(resolve) };
    function execute(single) {
      if (table === "newsletter_events") return { data: s.events ?? [], error: null };
      if (table === "nu_news_publications") {
        if (operation === "upsert") { s.public = true; return { data: [{ issue_id: value.issue_id }], error: null }; }
        return { data: s.public ? { issue_id: id } : null, error: null };
      }
      const target = table === "mailing_lists" ? s.group : s.row;
      if (!filters.every(([k, v]) => target[k] === v)) return { data: single ? null : [], error: null };
      if (operation === "update") Object.assign(target, value, { updated_at: `v${++version}` });
      if (operation === "insert") Object.assign(target, value);
      return { data: structuredClone(target), error: null };
    }
    return q;
  } };
  s.provider = {
    domains: { list: async () => ({ data: { data: [{ id: "domain", name: "cal.taxi" }] }, error: null }), get: async () => ({ data: { status: "verified", open_tracking: true, click_tracking: true }, error: null }) },
    segments: { create: async () => ({ data: { id: "segment" }, error: null }) },
    contacts: { imports: { create: async (payload) => { s.importCalls++; s.importPayload = payload; return { data: { id: "import" }, error: null }; }, get: async () => ({ data: { status: "completed", counts: { total: 800, failed: s.failImport ? 1 : 0 } }, error: null }) } },
    broadcasts: { create: async () => { s.createCalls++; return { data: { id: "remote" }, error: null }; },
      get: async () => ({ data: { status: "draft", html: s.remoteChanged ? "changed" : renderBroadcast(row), from: row.sender, subject: row.subject, segment_id: row.segment_id, reply_to: [row.reply_to] }, error: null }),
      send: async () => { s.sendCalls++; if (s.failSend) throw new Error("timeout"); return { data: { id: "remote" }, error: null }; } },
  };
  return s;
}

test("pasted lists normalize, deduplicate, and report invalid entries", () => {
  const result = parseRecipients("ALEX@example.com; Sam <sam@example.com>\nalex@example.com,bad@\nnot-an-address");
  assert.deepEqual(result.recipients.map((r) => r.email), ["alex@example.com", "sam@example.com"]);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.invalid, ["bad@", "not-an-address"]);
  assert.throws(() => parseRecipients("x".repeat(2 * 1024 * 1024 + 1)), /2 MB/);
});
test("email rendering escapes HTML, preserves the message, and uses permanent public links", () => {
  const html = renderBroadcast({ body: '<script>alert("x")</script>\nHello & goodbye', postal_address: "Chapter <address>", newsletter_id: id });
  assert.ok(!html.includes("<script>")); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Hello &amp; goodbye/); assert.match(html, new RegExp(`https://cal.taxi/news/${id}`));
  assert.match(html, /RESEND_UNSUBSCRIBE_URL/); assert.match(html, /white-space:pre-wrap/);
});
test("send requires confirmation, current revision, and an identical Resend preview", async () => {
  const s = fixture();
  await assert.rejects(store.sendBroadcast(id, "v1", false), /confirm/);
  await assert.rejects(store.sendBroadcast(id, "old", true), /review/);
  s.remoteChanged = true;
  await assert.rejects(store.sendBroadcast(id, "v1", true), /differs/);
  assert.equal(s.sendCalls, 0);
});
test("concurrent send requests produce only one external send", async () => {
  const s = fixture();
  const results = await Promise.allSettled([store.sendBroadcast(id, "v1", true), store.sendBroadcast(id, "v1", true)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(s.sendCalls, 1); assert.equal(s.row.status, "sent");
  await store.sendBroadcast(id, "v1", true); assert.equal(s.sendCalls, 1);
});
test("ambiguous send failures remain in review and cannot be retried", async () => {
  const s = fixture(); s.failSend = true;
  await assert.rejects(store.sendBroadcast(id, "v1", true), /timeout/);
  assert.equal(s.row.status, "review");
  await assert.rejects(store.sendBroadcast(id, s.row.updated_at, true), /review/);
  assert.equal(s.sendCalls, 1);
});
test("800 recipients import in one job without overriding subscription status; preparation never sends", async () => {
  const s = fixture("draft"); s.row.resend_id = null; s.row.import_id = null;
  await store.prepareBroadcast(id, "v1");
  assert.equal(s.importCalls, 1); assert.equal(s.row.status, "preparing");
  assert.equal((await s.importPayload.file.text()).split("\r\n").length, 801);
  assert.equal("unsubscribed" in s.importPayload.columnMap, false); assert.equal("topics" in s.importPayload, false);
  await Promise.allSettled([store.prepareBroadcast(id, s.row.updated_at), store.prepareBroadcast(id, s.row.updated_at)]);
  assert.equal(s.createCalls, 1); assert.equal(s.sendCalls, 0); assert.equal(s.row.status, "ready");
});
test("failed contact imports and unfinished newsletters cannot be sent or published", async () => {
  const s = fixture("preparing"); s.failImport = true;
  await store.prepareBroadcast(id, "v1"); assert.equal(s.row.status, "review"); assert.equal(s.createCalls, 0);
  await assert.rejects(store.publishNewsletter(id), /Finalize/); assert.equal(s.public, false);
});
test("public access refuses unpublished, unfinished, and malformed issue URLs", async () => {
  const s = fixture();
  assert.equal(await publication.loadPublishedIssue(id), null);
  s.public = true; s.issue = { id, finalized_at: null, final_pdf_path: null };
  assert.equal(await publication.loadPublishedIssue(id), null);
  assert.equal(await publication.loadPublishedIssue("not-an-id"), null);
  s.issue = { id, finalized_at: "2026-10-14", final_pdf_path: "final.pdf" };
  assert.equal((await publication.loadPublishedIssue(id)).id, id);
});
test("every server action authorizes before touching storage or email", async () => {
  const s = fixture(); s.allowed = false;
  for (const action of [() => actions.saveMailingGroup("List", "a@example.com", listId), () => actions.saveBroadcastDraft({}, id), () => actions.prepareMailingBroadcast(id, "v1"), () => actions.sendMailingBroadcast(id, "v1", true), () => actions.refreshMailingBroadcast(id)]) await assert.rejects(action(), /Access denied/);
  assert.equal(s.dbCalls, 0); assert.equal(s.sendCalls, 0);
});
test("every MCP mailing tool authorizes before data access; sending requires literal approval", async () => {
  const s = fixture(), tools = new Map();
  mcp.registerMailingTools({ registerTool: (name, config, handler) => tools.set(name, { config, handler }) }, async () => { throw new Error("Access denied"); });
  for (const { handler } of tools.values()) await assert.rejects(handler({ broadcastId: id, listId, issueId: id }), /Access denied/);
  assert.equal(s.dbCalls, 0);
  assert.equal(tools.get("send_broadcast").config.inputSchema.safeParse({ broadcastId: id, expectedUpdatedAt: "v1", confirm: false }).success, false);
});
test("analytics paginate recipients and distinguish email activity from page and PDF clicks", async () => {
  const s = fixture("sent"), calls = [];
  s.provider.broadcasts.recipients = async (_id, options) => {
    calls.push(options);
    return { data: options.type === "opened" ? options.after ? { data: [{ id: "b", email: "b@example.com", count: 1 }], has_more: false } : { data: [{ id: "a", email: "a@example.com", count: 3 }], has_more: true } : { data: [{ id: "a", email: "a@example.com", count: 2 }], has_more: false }, error: null };
  };
  s.events = [{ kind: "page_view", visitor_id: "one" }, { kind: "page_view", visitor_id: "one" }, { kind: "pdf_open", visitor_id: "one" }, { kind: "pdf_download", visitor_id: "two" }];
  const stats = await analytics.loadBroadcastAnalytics(id);
  assert.equal(calls[1].after, "a"); assert.equal(stats.uniqueOpens, 2); assert.equal(stats.totalOpens, 4); assert.equal(stats.uniqueClicks, 1); assert.equal(stats.totalClicks, 2);
  assert.equal(stats.pageViews, 2); assert.equal(stats.pageReaders, 1); assert.equal(stats.pdfOpens, 1); assert.equal(stats.pdfDownloads, 1);
  assert.deepEqual(stats.recipients[0], { email: "a@example.com", opens: 3, clicks: 2 });
});
test("migration protects mailing data and seeds the approved draft without sending or publishing", async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.nu_news_issues(id uuid primary key);
    create function public.has_app_access(text,text) returns boolean language sql as $$ select current_setting('test.allowed',true) = 'yes' $$;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;`);
  await db.exec(await readFile("supabase/migrations/20261014160000_mailing_broadcasts.sql", "utf8"));
  const [draft] = (await db.query("select * from mailing_broadcasts")).rows;
  assert.equal(draft.subject, "Theta Xi Nu News! (Fall 2026) October"); assert.equal(draft.status, "draft");
  assert.match(draft.body, /Sean F\. Islandhouse, Nu 1057/); assert.equal(draft.resend_id, null);
  assert.equal((await db.query("select * from nu_news_publications")).rows.length, 0);
  await db.exec("set role anon"); await assert.rejects(db.query("select * from mailing_broadcasts"), /permission denied/);
  await db.exec("reset role; set role authenticated"); assert.equal((await db.query("select * from mailing_broadcasts")).rows.length, 0);
  await db.exec("select set_config('test.allowed','yes',false)"); assert.equal((await db.query("select * from mailing_broadcasts")).rows.length, 1);
  await assert.rejects(db.query("update mailing_broadcasts set status='sent'"), /permission denied/);
  await assert.rejects(db.query("select * from nu_news_publications"), /permission denied/);
  await db.exec("reset role; set role service_role; update mailing_broadcasts set status='preparing'");
  await assert.rejects(db.query("update mailing_broadcasts set body='changed'"), /immutable/);
  await assert.rejects(db.query("update mailing_broadcasts set status='draft'"), /immutable/);
  await db.exec("update mailing_broadcasts set status='sent'");
  assert.ok((await db.query("select finalized_at from mailing_broadcasts")).rows[0].finalized_at);
  await assert.rejects(db.query("update mailing_broadcasts set status='ready'"), /immutable/);
  await assert.rejects(db.query("delete from mailing_broadcasts"), /immutable/);
});
