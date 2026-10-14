import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { build } from "esbuild";

// The server runs against an in-memory Supabase: the test swaps the admin client and skips the server-only guard.
const testModules = {
  name: "nu-news-mcp-test-modules",
  setup(builder) {
    builder.onResolve({ filter: /^(server-only|@\/lib\/reimbursements\/supabase\/admin)$/ }, (args) => ({ path: args.path, namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
      contents: args.path === "server-only" ? "" : "export const createAdminClient = () => globalThis.nuNewsTestAdmin;",
    }));
  },
};
const bundle = await build({
  stdin: { contents: 'export { createFinanceServer } from "./lib/mcp/server.ts"; export { decodeNuNewsPhoto } from "./lib/mcp/nu-news-photo.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [testModules],
});
const temporary = path.join(process.cwd(), "node_modules/.nu-news-mcp-test.mjs");
await writeFile(temporary, bundle.outputFiles[0].text);
const { createFinanceServer, decodeNuNewsPhoto } = await import(`file://${temporary.replaceAll("\\", "/")}`);
await unlink(temporary);

const NU_NEWS_TOOLS = [
  "list_nu_news_issues", "get_nu_news_issue", "create_nu_news_issue", "update_nu_news_issue",
  "add_nu_news_article", "update_nu_news_article", "remove_nu_news_article",
  "set_nu_news_title_photo", "set_nu_news_headshot", "add_nu_news_gallery_photo", "update_nu_news_gallery_photo",
  "remove_nu_news_gallery_photo", "set_nu_news_photo_focus", "make_nu_news_preview", "finalize_nu_news_issue", "get_nu_news_pdf_url",
];
const READ_ONLY = ["list_nu_news_issues", "get_nu_news_issue", "get_nu_news_pdf_url"];
const DESTRUCTIVE = ["remove_nu_news_article", "remove_nu_news_gallery_photo", "finalize_nu_news_issue"];
const FINAL_ISSUE = "This issue is final and can no longer change.";

const segmentOffset = (bytes, marker) => {
  let offset = 2;
  while (bytes[offset + 1] !== marker) offset += 2 + bytes.readUInt16BE(offset + 2);
  return offset;
};
const withoutSegment = (bytes, marker) => {
  const offset = segmentOffset(bytes, marker);
  return Buffer.concat([bytes.subarray(0, offset), bytes.subarray(offset + 2 + bytes.readUInt16BE(offset + 2))]);
};
const withSize = (bytes, width, height) => {
  const resized = Buffer.from(bytes);
  const frame = segmentOffset(resized, 0xc0);
  resized.writeUInt16BE(height, frame + 5);
  resized.writeUInt16BE(width, frame + 7);
  return resized;
};
const dataUrl = (bytes, type = "image/jpeg") => `data:${type};base64,${bytes.toString("base64")}`;
const signedUrl = (name, seconds = 600) => `https://storage.test/${name}?expires=${seconds}`;

// A 360 × 480 camera JPEG with EXIF, IPTC, and an ICC profile; the prepared copy keeps only the ICC profile.
const camera = await readFile("scripts/fixtures/nu-news/photos/cover.jpg");
const prepared = withoutSegment(withoutSegment(camera, 0xe1), 0xed);
const rotatedExif = Buffer.from("457869660000" + "4d4d002a00000008" + "0001" + "011200030000000100060000" + "00000000", "hex");
const rotated = Buffer.concat([prepared.subarray(0, 2), Buffer.from([0xff, 0xe1, 0, rotatedExif.length + 2]), rotatedExif, prepared.subarray(2)]);

function fakeSupabase(adminId) {
  let version = 0;
  const tables = {
    nu_news_issues: [],
    profiles: [{ id: adminId, full_name: "Taylor Admin", email: "taylor@example.com" }],
    mcp_audit_log: [],
  };
  const files = new Map();
  const newIssue = () => ({
    issue_date: "2026-10-14", location: "Berkeley, CA", intro: { heading: "", body: "" }, articles: [], cover: null, gallery: [],
    preview_made_at: null, finalized_at: null, finalized_by: null, finalized_by_name: null, final_pdf_path: null,
    final_pdf_sha256: null, final_inputs: null, created_at: new Date().toISOString(),
  });

  class Query {
    filters = [];
    sorts = [];
    count = Infinity;
    mode = "many";
    action = "select";
    constructor(table) { this.table = table; }
    select() { return this; }
    insert(values) { this.action = "insert"; this.values = values; return this; }
    update(values) { this.action = "update"; this.values = values; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    order(column, { ascending }) { this.sorts.push([column, ascending ? 1 : -1]); return this; }
    limit(count) { this.count = count; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }

    run() {
      const rows = tables[this.table];
      if (this.action === "insert") {
        const row = { id: randomUUID(), ...(this.table === "nu_news_issues" ? newIssue() : {}), ...structuredClone(this.values), updated_at: String(++version) };
        rows.push(row);
        return this.answer([row]);
      }
      const matched = rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
      if (this.action === "update") {
        if (matched.some((row) => row.finalized_at)) return { data: null, error: { code: "22023", message: "Finalized Nu News issues are immutable" } };
        for (const row of matched) Object.assign(row, structuredClone(this.values), { updated_at: String(++version) });
      }
      const sorted = [...matched].sort((a, b) => this.sorts.reduce((order, [column, direction]) => order || direction * String(a[column]).localeCompare(String(b[column])), 0));
      return this.answer(sorted.slice(0, this.count));
    }

    answer(rows) {
      const copies = structuredClone(rows);
      if (this.mode === "many") return { data: copies, error: null };
      if (this.mode === "single" && copies.length !== 1) return { data: null, error: { message: "Expected one row" } };
      return { data: copies[0] ?? null, error: null };
    }
  }

  const bucket = {
    async upload(name, bytes, { upsert }) {
      if (files.has(name) && !upsert) return { data: null, error: { message: "The resource already exists" } };
      files.set(name, Buffer.from(bytes));
      return { data: { path: name }, error: null };
    },
    async download(name) {
      return files.has(name) ? { data: new Blob([files.get(name)]), error: null } : { data: null, error: new Error("Object not found") };
    },
    async createSignedUrl(name, seconds) {
      return files.has(name) ? { data: { signedUrl: signedUrl(name, seconds) }, error: null } : { data: null, error: { message: "Object not found" } };
    },
    async createSignedUrls(names, seconds) {
      return { data: names.map((name) => ({ path: name, signedUrl: files.has(name) ? signedUrl(name, seconds) : null })), error: null };
    },
  };
  return { tables, files, from: (table) => new Query(table), storage: { from: () => bucket } };
}

function connect({ isMcpAdmin = true } = {}) {
  const adminId = randomUUID();
  const admin = fakeSupabase(adminId);
  globalThis.nuNewsTestAdmin = admin;
  const user = { rpc: async (name) => ({ data: name === "is_mcp_admin" && isMcpAdmin, error: null }) };
  const handler = createMcpHandler(() => createFinanceServer(user, { userId: adminId, clientId: "test-client" }));

  async function request(method, params) {
    const response = await handler.fetch(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    return JSON.parse((await response.text()).match(/^data: (.*)$/m)[1]).result;
  }
  const call = (name, args = {}) => request("tools/call", { name, arguments: args });
  async function ok(name, args) {
    const result = await call(name, args);
    assert.ok(!result.isError, `${name} failed: ${result.content?.[0]?.text}`);
    return result.structuredContent;
  }
  async function refused(name, args, message) {
    const result = await call(name, args);
    assert.equal(result.isError, true, `${name} was not refused`);
    assert.match(result.content[0].text, message);
  }
  return { admin, adminId, request, ok, refused };
}

test("Nu News tools are listed with safety hints and the workflow", async () => {
  const { request } = connect();
  const tools = new Map((await request("tools/list", {})).tools.map((tool) => [tool.name, tool]));
  for (const name of NU_NEWS_TOOLS) {
    const { annotations } = tools.get(name);
    assert.equal(annotations.readOnlyHint, READ_ONLY.includes(name), `${name} readOnlyHint`);
    assert.equal(annotations.destructiveHint, DESTRUCTIVE.includes(name), `${name} destructiveHint`);
    assert.equal(annotations.openWorldHint, false, `${name} openWorldHint`);
  }
  assert.match(tools.get("create_nu_news_issue").description, /make_nu_news_preview.*finalize_nu_news_issue/);
  assert.match(tools.get("add_nu_news_article").description, /exactly as given: never rewrite/);
  assert.match(tools.get("get_nu_news_issue").description, /viewUrl to look at it.*set_nu_news_photo_focus\. The signed link expires after 10 minutes\./);
  assert.match(tools.get("set_nu_news_title_photo").description, /JPEG up to 3 MB, at most 2200 pixels on the long side, upright, with no metadata/);
  assert.deepEqual(tools.get("finalize_nu_news_issue").inputSchema.required, ["issueId", "confirmSeason"]);
  assert.deepEqual(tools.get("remove_nu_news_article").inputSchema.required, ["issueId", "articleId", "confirm"]);
});

test("only active administrators with an OAuth grant can use Nu News tools", async () => {
  const { admin, refused } = connect({ isMcpAdmin: false });
  admin.tables.nu_news_issues.push({ id: randomUUID(), season: "Fall 2026" });
  await refused("list_nu_news_issues", {}, /An active administrator OAuth grant is required/);
  await refused("create_nu_news_issue", { requestId: randomUUID() }, /An active administrator OAuth grant is required/);
  assert.equal(admin.tables.nu_news_issues.length, 1);
  assert.equal(admin.tables.mcp_audit_log.length, 0);
});

test("an agent can create, fill, preview, and finalize a whole issue", async () => {
  const { admin, adminId, ok, refused } = connect();
  const lastDonate = { heading: "HOW TO DONATE", body: "Zelle: calthetaxi@gmail.com" };
  admin.tables.nu_news_issues.push({ id: randomUUID(), season: "Spring 2026", issue_date: "2026-04-01", location: "Oakland, CA", donate: lastDonate, created_at: "2026-04-01", finalized_at: "2026-04-02" });

  const createRequest = randomUUID();
  const created = await ok("create_nu_news_issue", { season: "Fall 2026", issueDate: "2026-10-14", requestId: createRequest });
  assert.equal((await ok("create_nu_news_issue", { season: "Fall 2026", requestId: createRequest })).id, created.id);
  assert.deepEqual([created.status, created.season, created.issue_date, created.location, created.donate], ["draft", "Fall 2026", "2026-10-14", "Oakland, CA", lastDonate]);
  const issueId = created.id;

  const body = "  First paragraph, *exactly* as sent.  \n\n#second line $x$";
  const articleId = randomUUID();
  await ok("add_nu_news_article", { issueId, requestId: articleId, title: "Hello", author: "Alex Rivera", roster: "Nu 1048", body });
  await ok("add_nu_news_article", { issueId, requestId: articleId, title: "Hello", author: "Alex Rivera", roster: "Nu 1048", body });
  const extraArticle = randomUUID();
  await ok("add_nu_news_article", { issueId, requestId: extraArticle, author: "Sam Patel" });
  await ok("update_nu_news_article", { issueId, articleId: extraArticle, position: 1 });
  await refused("remove_nu_news_article", { issueId, articleId: extraArticle }, /confirm/);
  await ok("remove_nu_news_article", { issueId, articleId: extraArticle, confirm: true });

  const title = await ok("set_nu_news_title_photo", { issueId, photoDataUrl: dataUrl(prepared), requestId: randomUUID() });
  const headshot = await ok("set_nu_news_headshot", { issueId, articleId, photoDataUrl: dataUrl(prepared), requestId: randomUUID() });
  const [first, second] = [
    await ok("add_nu_news_gallery_photo", { issueId, photoDataUrl: dataUrl(prepared), requestId: randomUUID() }),
    await ok("add_nu_news_gallery_photo", { issueId, photoDataUrl: dataUrl(prepared), requestId: randomUUID() }),
  ];
  assert.match(title.src, new RegExp(`^${issueId}/[0-9a-f-]{36}\\.jpg$`));
  assert.ok(admin.files.get(title.src).equals(prepared));
  await ok("update_nu_news_gallery_photo", { issueId, src: first.src, donate: true });
  await ok("update_nu_news_gallery_photo", { issueId, src: second.src, donate: true, feature: true, position: 1 });
  await ok("set_nu_news_photo_focus", { issueId, src: headshot.src, x: 0.5, y: 0.2 });
  await refused("set_nu_news_photo_focus", { issueId, src: `${issueId}/${randomUUID()}.jpg`, x: 0.5, y: 0.5 }, /no photo with that src/);

  const draft = await ok("get_nu_news_issue", { issueId });
  assert.deepEqual(draft.articles.map((article) => [article.id, article.body, article.closing]), [[articleId, body, "YITB,"]]);
  assert.deepEqual(draft.articles[0].headshot, { src: headshot.src, focus: [0.5, 0.2], viewUrl: signedUrl(headshot.src) });
  assert.deepEqual(draft.cover, { src: title.src, focus: [0.5, 0.5], viewUrl: signedUrl(title.src) });
  assert.deepEqual(
    draft.gallery.map((photo) => [photo.src, photo.feature, photo.donate, photo.viewUrl]),
    [[second.src, true, true, signedUrl(second.src)], [first.src, false, false, signedUrl(first.src)]],
  );
  assert.deepEqual(draft.missingItems, ["No intro heading", "No intro text"]);
  assert.equal(draft.preview_made_at, null);

  const preview = await ok("make_nu_news_preview", { issueId });
  assert.match(preview.previewPdfUrl, new RegExp(`/${issueId}/preview\\.pdf\\?expires=600$`));
  assert.match(admin.files.get(`${issueId}/preview.pdf`).subarray(0, 5).toString(), /^%PDF-/);
  assert.match(preview.photoWarnings.find((warning) => warning.src === title.src).text, /^The title photo loses \d+% of its height\. Set its focus point or use a wider photo\.$/);
  assert.deepEqual(preview.missingItems, ["No intro heading", "No intro text"]);

  await refused("finalize_nu_news_issue", { issueId, confirmSeason: "Fall 2025" }, /confirmSeason must match/);
  await refused("finalize_nu_news_issue", { issueId, confirmSeason: "Fall 2026" }, /Still missing: No intro heading; No intro text\./);
  const filled = await ok("update_nu_news_issue", { issueId, intro: { heading: "Happy Fall!", body: "Welcome back." } });
  assert.deepEqual(filled.missingItems, []);

  const final = await ok("finalize_nu_news_issue", { issueId, confirmSeason: "Fall 2026" });
  const finalPath = admin.tables.nu_news_issues.find((issue) => issue.id === issueId).final_pdf_path;
  assert.deepEqual([final.status, final.finalizedBy], ["final", "Taylor Admin"]);
  assert.equal(final.finalPdfSha256, createHash("sha256").update(admin.files.get(finalPath)).digest("hex"));
  assert.match(final.finalPdfUrl, new RegExp(`/${issueId}/final/[0-9a-f-]{36}\\.pdf\\?expires=600$`));
  assert.equal(admin.tables.nu_news_issues.find((issue) => issue.id === issueId).finalized_by, adminId);

  const filesBefore = admin.files.size;
  await refused("update_nu_news_issue", { issueId, season: "Fall 2026 (fixed)" }, new RegExp(FINAL_ISSUE));
  await refused("update_nu_news_article", { issueId, articleId, body: "Rewritten" }, new RegExp(FINAL_ISSUE));
  await refused("set_nu_news_title_photo", { issueId, photoDataUrl: dataUrl(prepared), requestId: randomUUID() }, new RegExp(FINAL_ISSUE));
  await refused("set_nu_news_photo_focus", { issueId, src: title.src, x: 0, y: 0 }, new RegExp(FINAL_ISSUE));
  await refused("make_nu_news_preview", { issueId }, /Only a draft issue has a preview/);
  await refused("finalize_nu_news_issue", { issueId, confirmSeason: "Fall 2026" }, new RegExp(FINAL_ISSUE));
  assert.equal(admin.files.size, filesBefore);

  assert.match((await ok("get_nu_news_pdf_url", { issueId })).pdfUrl, /\/final\//);
  const finalIssue = await ok("get_nu_news_issue", { issueId });
  assert.deepEqual([finalIssue.cover.viewUrl, finalIssue.articles[0].headshot.viewUrl], [signedUrl(title.src), signedUrl(headshot.src)]);
  const listed = (await ok("list_nu_news_issues", {})).issues;
  assert.deepEqual(listed.map((issue) => [issue.season, issue.status]), [["Fall 2026", "final"], ["Spring 2026", "final"]]);
  assert.equal(listed[0].finalized_by_name, "Taylor Admin");
  const audited = admin.tables.mcp_audit_log;
  assert.ok(audited.every((row) => row.user_id === adminId && row.client_id === "test-client"));
  assert.ok(audited.some((row) => row.tool_name === "finalize_nu_news_issue" && row.target_id === issueId));
});

test("photo uploads accept only prepared JPEGs", async () => {
  assert.ok(decodeNuNewsPhoto(dataUrl(prepared)).equals(prepared));
  assert.ok(decodeNuNewsPhoto(dataUrl(withSize(prepared, 2200, 1650))));
  assert.throws(() => decodeNuNewsPhoto(dataUrl(Buffer.from("iVBORw0KGgoAAAANSUhEUg==", "base64"), "image/png")), /must be a JPEG data URL/);
  assert.throws(() => decodeNuNewsPhoto(dataUrl(Buffer.from("iVBORw0KGgoAAAANSUhEUg==", "base64"))), /not a JPEG/);
  assert.throws(() => decodeNuNewsPhoto(dataUrl(Buffer.concat([prepared, Buffer.alloc(3 * 1024 * 1024)]))), /up to 3 MB/);
  assert.throws(() => decodeNuNewsPhoto(dataUrl(withSize(prepared, 3024, 4032))), /3024 × 4032 pixels\. Turn the photo upright.*at most 2200 pixels/);
  assert.throws(() => decodeNuNewsPhoto(dataUrl(rotated)), /has metadata\. Turn the photo upright, remove all its metadata/);
  assert.throws(() => decodeNuNewsPhoto(dataUrl(camera)), /has metadata/);

  const { admin, ok, refused } = connect();
  const { id: issueId } = await ok("create_nu_news_issue", { requestId: randomUUID() });
  await refused("add_nu_news_gallery_photo", { issueId, photoDataUrl: dataUrl(rotated), requestId: randomUUID() }, /has metadata/);
  await refused("set_nu_news_headshot", { issueId, articleId: randomUUID(), photoDataUrl: dataUrl(prepared), requestId: randomUUID() }, /no article with that ID/);
  assert.equal(admin.files.size, 0);
});
