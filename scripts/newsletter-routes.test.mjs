import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";

const bundle = await build({ stdin: { contents: 'export {GET as pdf, HEAD as head} from "./app/(public)/public-site/news/[id]/pdf/route"; export {POST as view} from "./app/(public)/public-site/news/[id]/view/route";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [{ name: "server-only", setup(b) { b.onResolve({ filter: /^next\/server$/ }, () => ({ path: "next/server.js", external: true })); b.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" })); b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" })); } }] });
const temporary = new URL("../node_modules/.newsletter-route-test.mjs", import.meta.url);
await writeFile(temporary, bundle.outputFiles[0].text);
const routes = await import(temporary.href); await unlink(temporary);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
process.env.SUPABASE_SECRET_KEY = "test-only-key";
const id = "778ed178-cd4b-4f39-8fe7-44f81e52a8ec", broadcast = "9948aa45-71c7-4225-9cf4-5546977bd72c";
const context = { params: Promise.resolve({ id }) };
function fixture() {
  const s = { published: true, final: true, events: [], failTracking: false, matchedSource: true, requests: 0 };
  globalThis.fetch = async (request, init) => {
    s.requests++;
    const url = new URL(request);
    if (url.pathname.includes("nu_news_publications")) return Response.json(s.published ? { issue_id: id } : null);
    if (url.pathname.includes("nu_news_issues")) return Response.json({ id, season: "Fall 2026", finalized_at: s.final ? "2026-10-14" : null, final_pdf_path: s.final ? "final.pdf" : null });
    if (url.pathname.includes("mailing_broadcasts")) return Response.json(s.matchedSource ? { id: broadcast } : null);
    if (url.pathname.includes("newsletter_events")) { if (s.failTracking) return Response.json({ message: "Unavailable" }, { status: 503 }); s.events.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    if (url.pathname.includes("/storage/")) return Response.json({ signedURL: "/object/sign/nu-news/final.pdf?token=test" });
    throw new Error(`Unexpected test URL: ${url.pathname}`);
  };
  return s;
}
const address = (query = "") => `https://cal.taxi/news/${id}/pdf?broadcast=${broadcast}${query}`;
test("unpublished and draft issues never expose a PDF", async () => {
  const s = fixture(); s.published = false;
  assert.equal((await routes.pdf(new Request(address()), context)).status, 404);
  s.published = true; s.final = false;
  assert.equal((await routes.pdf(new Request(address()), context)).status, 404);
  assert.equal(s.events.length, 0);
});
test("public page visits and PDF link clicks use a pseudonymous browser cookie and preserve campaign attribution", async () => {
  const s = fixture();
  const opened = await routes.pdf(new Request(address()), context);
  assert.equal(opened.status, 307); assert.match(opened.headers.get("location"), /^https:\/\/database.example.test\/storage\/v1\/object\/sign/);
  assert.match(opened.headers.get("set-cookie"), /HttpOnly/); assert.equal(s.events[0].kind, "pdf_open"); assert.equal(s.events[0].broadcast_id, broadcast);
  const cookie = opened.headers.get("set-cookie").split(";")[0];
  await routes.view(new Request(`https://cal.taxi/news/${id}/view?broadcast=${broadcast}`, { method: "POST", headers: { cookie, origin: "https://cal.taxi" } }), context);
  await routes.pdf(new Request(address("&download=1"), { headers: { cookie } }), context);
  assert.deepEqual(s.events.map((e) => e.kind), ["pdf_open", "page_view", "pdf_download"]);
  assert.equal(new Set(s.events.map((e) => e.visitor_id)).size, 1);
  await routes.pdf(new Request(address("&embedded=1")), context);
  await routes.head(new Request(address(), { method: "HEAD" }), context);
  assert.equal(s.events.length, 3);
});
test("invalid campaign attribution and unavailable analytics do not block reading", async () => {
  const s = fixture(); s.matchedSource = false;
  assert.equal((await routes.pdf(new Request(address()), context)).status, 307);
  assert.equal(s.events[0].broadcast_id, null);
  s.failTracking = true;
  assert.equal((await routes.pdf(new Request(address()), context)).status, 307);
});
test("the page-view endpoint refuses cross-origin tracking writes", async () => {
  const s = fixture();
  assert.equal((await routes.view(new Request(`https://cal.taxi/news/${id}/view`, { method: "POST", headers: { origin: "https://elsewhere.example" } }), context)).status, 403);
  assert.equal(s.requests, 0);
});
