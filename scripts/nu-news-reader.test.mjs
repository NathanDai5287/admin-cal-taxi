import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const result = await build({
  stdin: { contents: 'export { default as directory } from "./app/(admin)/nu-news/page"; export { default as issue } from "./app/(admin)/nu-news/[id]/page"; export { GET as pdf } from "./app/(admin)/nu-news/[id]/pdf/route";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node", packages: "external", jsx: "automatic",
  plugins: [{ name: "reader-fixtures", setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/navigation|next\/server)$|nu-news\/(store|actions)$|reimbursements\/auth$|\.\/issue-editor$|nu-news\/\[id\]\/issue-editor$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "jsx", resolveDir: process.cwd(), contents:
      path === "next/link" ? 'export default function Link(props) { return <a {...props} />; }' :
      path === "next/navigation" ? 'export function notFound() { throw new Error("NOT_FOUND"); }' :
      path === "next/server" ? 'export const NextResponse = { redirect: (url, options) => new Response(null, { status: 307, headers: { ...options.headers, Location: url } }) };' :
      path.endsWith("/auth") ? 'export const requireAppAccess = async () => globalThis.reader.session; export const getSessionProfile = requireAppAccess; export const hasAppAccess = (s) => s.appAccess["nu-news"] !== "none";' :
      path.endsWith("/actions") ? 'export async function createIssue() {}' :
      path.endsWith("/store") ? 'export const listIssues = async () => globalThis.reader.issues; export const loadIssue = async () => globalThis.reader.stored; export const photoUrls = async () => { globalThis.reader.photos++; return {}; }; export const pdfUrl = async (...args) => { globalThis.reader.pdfArgs = args; return "https://storage.example.test/final.pdf"; };' :
      'export function IssueEditor() { return <div>Draft editor</div>; }'
    }));
  } }],
});
const temporary = new URL("../node_modules/.nu-news-reader-test.mjs", import.meta.url);
await writeFile(temporary, result.outputFiles[0].text);
const routes = await import(temporary.href);
await unlink(temporary);
const id = "778ed178-cd4b-4f39-8fe7-44f81e52a8ec";
const context = { params: Promise.resolve({ id }) };
function fixture(access = "read") {
  return globalThis.reader = {
    session: { appAccess: { "nu-news": access } }, photos: 0,
    issues: [{ id, season: "Fall 2026", issue_date: "2026-10-14", finalized_at: "2026-10-14" }, { id: "draft", season: "Spring 2027", issue_date: "2027-04-01", finalized_at: null }],
    stored: { id, season: "Fall 2026", finalized_at: "2026-10-14", finalized_by_name: null, final_pdf_path: "final.pdf", cover: null, articles: [], gallery: [] },
  };
}

test("readers get a completed PDF directory with no drafts or editing instructions", async () => {
  fixture();
  const html = renderToStaticMarkup(await routes.directory());
  assert.match(html, /Fall 2026/);
  assert.match(html, /Newsletter issues/);
  assert.match(html, new RegExp(`/nu-news/${id}/pdf`));
  assert.match(html, /pdf\?view=1/);
  assert.match(html, /target="_blank"/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /Spring 2027|New issue|<th scope="col">Date|<th scope="col">Status|check the preview/);
});
test("the reader link opens the storage PDF without forcing a download", async () => {
  const state = fixture();
  const response = await routes.pdf(new Request(`https://cal.taxi/nu-news/${id}/pdf?view=1`), context);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://storage.example.test/final.pdf");
  assert.deepEqual(state.pdfArgs.slice(1), [60, false]);
});
test("reader empty state refers only to completed issues", async () => {
  const state = fixture(); state.issues = state.issues.slice(1);
  assert.match(renderToStaticMarkup(await routes.directory()), /No completed issues yet/);
});
test("writers keep drafts and the creation action", async () => {
  fixture("write");
  const html = renderToStaticMarkup(await routes.directory());
  assert.match(html, /Spring 2027/); assert.match(html, /New issue/); assert.match(html, /Draft/);
});
test("a final issue displays the PDF without loading photos or repeating fields", async () => {
  const state = fixture();
  const html = renderToStaticMarkup(await routes.issue(context));
  assert.match(html, /application\/pdf/); assert.match(html, /final.pdf/); assert.match(html, /Download PDF/);
  assert.doesNotMatch(html, /Issue details|Intro text|How to donate|Draft editor/);
  assert.equal(state.photos, 0); assert.deepEqual(state.pdfArgs.slice(1), [3600, false]);
});
test("readers cannot reach draft pages or draft PDFs by URL", async () => {
  const state = fixture(); state.stored.finalized_at = null;
  await assert.rejects(routes.issue(context), /NOT_FOUND/);
  assert.equal((await routes.pdf(new Request(`https://cal.taxi/nu-news/${id}/pdf`), context)).status, 404);
  assert.equal(state.pdfArgs, undefined);
});
test("writers can still edit and preview drafts", async () => {
  const state = fixture("write"); state.stored.finalized_at = null;
  assert.match(renderToStaticMarkup(await routes.issue(context)), /Draft editor/);
  assert.equal((await routes.pdf(new Request(`https://cal.taxi/nu-news/${id}/pdf`), context)).status, 307);
});
