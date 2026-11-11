import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

const bundled = await build({
  stdin: { contents: 'export { directoryPdfUrls } from "./lib/nu-news/store";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node", packages: "external",
  plugins: [{ name: "storage-fixture", setup(b) {
    b.onResolve({ filter: /^server-only$|supabase\/admin$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "server-only" ? "" : `
      export const createAdminClient = () => ({ storage: { from: (bucket) => ({
        createSignedUrls: async (paths, expires) => {
          globalThis.pdfLinks.calls.push({ bucket, paths, expires });
          return globalThis.pdfLinks.result;
        }
      }) } });
    ` }));
  } }],
});
const temporary = new URL("../node_modules/.nu-news-pdf-links-test.mjs", import.meta.url);
await writeFile(temporary, bundled.outputFiles[0].text);
const { directoryPdfUrls } = await import(temporary.href);
await unlink(temporary);

test("archive signing batches final PDFs only, without a download flag", async () => {
  globalThis.pdfLinks = { calls: [], result: { data: [
    { path: "final.pdf", signedUrl: "https://storage.test/final.pdf", error: null },
    { path: "missing.pdf", signedUrl: null, error: "Not found" },
  ], error: null } };
  const before = Date.now();
  const { urls, expiresAt } = await directoryPdfUrls([
    { finalized_at: "2026-11-01", final_pdf_path: "final.pdf" },
    { finalized_at: null, final_pdf_path: "draft.pdf" },
    { finalized_at: "2026-11-01", final_pdf_path: null },
    { finalized_at: "2026-11-01", final_pdf_path: "missing.pdf" },
  ], 3600);
  assert.deepEqual(globalThis.pdfLinks.calls, [{ bucket: "nu-news", paths: ["final.pdf", "missing.pdf"], expires: 3600 }]);
  assert.deepEqual(urls, { "final.pdf": "https://storage.test/final.pdf" });
  assert.ok(expiresAt >= before + 3540000 && expiresAt <= Date.now() + 3540000);
});

test("an empty archive skips Storage and signing failures allow a redirect fallback", async () => {
  globalThis.pdfLinks = { calls: [], result: { data: null, error: { message: "unavailable" } } };
  assert.deepEqual((await directoryPdfUrls([], 3600)).urls, {});
  assert.equal(globalThis.pdfLinks.calls.length, 0);
  assert.deepEqual((await directoryPdfUrls([{ finalized_at: "2026-11-01", final_pdf_path: "final.pdf" }], 3600)).urls, {});
});
