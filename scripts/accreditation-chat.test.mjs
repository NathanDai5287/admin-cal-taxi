import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import {
  groupCitationsByDocument,
  isImageAttachment,
  isSupportedChatAttachment,
  keepSupportedCitations,
  selectClosestContexts,
} from "../lib/accreditation/chat.ts";
import { safeMarkdownHref, isSafeSmallMermaid } from "../lib/accreditation/chat-markdown.ts";
import {
  buildSourceCatalogAnswer,
  isUsableAccreditationCatalogEntry,
  isUsablePolicyCatalogEntry,
} from "../lib/accreditation/source-catalog.ts";
import { processingRetryDelayMs } from "../lib/accreditation/batch.ts";

test("chat attachments accept supported documents and common images", () => {
  for (const name of ["policy.pdf", "notes.docx", "budget.xlsx", "details.txt", "photo.PNG", "scan.jpeg", "diagram.webp"]) {
    assert.equal(isSupportedChatAttachment(name), true, name);
  }
  assert.equal(isSupportedChatAttachment("archive.zip"), false);
  assert.equal(isSupportedChatAttachment("macro.docm"), false);
  assert.equal(isImageAttachment("scan.JPG", ""), true);
  assert.equal(isImageAttachment("upload", "image/png"), true);
});

test("temporary attachment chunks are ranked by their in-memory embeddings", () => {
  const contexts = [
    { ref: "ATT:0:0", content: "first", title: "a.txt", kind: "attachment", subtitle: "", locator: {} },
    { ref: "ATT:0:1", content: "second", title: "a.txt", kind: "attachment", subtitle: "", locator: {} },
    { ref: "ATT:0:2", content: "third", title: "a.txt", kind: "attachment", subtitle: "", locator: {} },
  ];
  assert.deepEqual(selectClosestContexts(contexts, [[1, 0], [0, 1], [0.8, 0.2]], [1, 0], 2).map((item) => item.ref), ["ATT:0:0", "ATT:0:2"]);
  assert.throws(() => selectClosestContexts(contexts, [[1, 0]], [1, 0]), /Every temporary context/);
});

test("chat citations must quote the referenced passage exactly after whitespace normalization", () => {
  const contexts = [{ ref: "POL:one:0", content: "Events require\nadvance written approval.", title: "Policy", kind: "policy", subtitle: "", locator: {} }];
  const kept = keepSupportedCitations([
    { ref: "POL:one:0", quote: "Events require advance written approval." },
    { ref: "POL:one:0", quote: "Events are automatically approved." },
    { ref: "POL:secret:0", quote: "Events require advance written approval." },
  ], contexts);
  assert.deepEqual(kept, [{ ref: "POL:one:0", quote: "Events require advance written approval." }]);
});

test("chat citations are grouped once per document while preserving cited locations", () => {
  const contexts = [
    { ref: "POL:one:0", content: "First clause.", title: "Policy", kind: "policy", subtitle: "Authority · v1", locator: { page: 1 }, sourceId: "one" },
    { ref: "POL:one:1", content: "Second clause.", title: "Policy", kind: "policy", subtitle: "Authority · v1", locator: { page: 2 }, sourceId: "one" },
    { ref: "ACC:two:0", content: "Evidence.", title: "Evidence.pdf", kind: "accreditation", subtitle: "official guideline", locator: { page: 4 }, sourceId: "two" },
  ];
  const grouped = groupCitationsByDocument([
    { ref: "POL:one:0", quote: "First clause." },
    { ref: "POL:one:1", quote: "Second clause." },
    { ref: "POL:one:0", quote: "First clause." },
    { ref: "ACC:two:0", quote: "Evidence." },
  ], contexts);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0], {
    key: "policy:one", title: "Policy", kind: "policy", subtitle: contexts[0].subtitle, sourceId: "one", locators: [{ page: 1 }, { page: 2 }],
    excerpts: [
      { quote: "First clause.", locator: { page: 1 } },
      { quote: "Second clause.", locator: { page: 2 } },
    ],
  });
  assert.equal(grouped[1].key, "accreditation:two");
  assert.deepEqual(grouped[1].excerpts, [{ quote: "Evidence.", locator: { page: 4 } }]);
});

test("assistant Markdown links allow only HTTPS and same-site paths", () => {
  assert.equal(safeMarkdownHref("https://example.org/policy"), "https://example.org/policy");
  assert.equal(safeMarkdownHref("/api/policy/sources/123"), "/api/policy/sources/123");
  assert.equal(safeMarkdownHref("#details"), "#details");
  for (const href of ["javascript:alert(1)", "data:text/html,hello", "//example.org", "\\\\example.org", "http://example.org", "mailto:staff@example.org"]) {
    assert.equal(safeMarkdownHref(href), "", href);
  }
});

test("assistant Markdown renders GFM while dropping raw HTML, images, and unsafe links", () => {
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    skipHtml: true,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSanitize],
    urlTransform: safeMarkdownHref,
    components: {
      a: ({ href, children }) => {
        const safeHref = href ? safeMarkdownHref(href) : "";
        return safeHref ? React.createElement("a", { href: safeHref }, children) : React.createElement("span", null, children);
      },
      img: () => null,
    },
  }, "A direct answer.\n\n| Step | Owner |\n| --- | --- |\n| Review | Officer |\n\n`code`\n\n<script>alert(1)</script><img src=x onerror=alert(2)>\n\n![remote image](https://example.org/image.png)\n\n[unsafe](javascript:alert(3))"));
  assert.match(html, /<table>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /A direct answer\./);
  assert.doesNotMatch(html, /<script|<img|onerror|href="javascript:/i);
  assert.match(html, /unsafe/);
});

test("Mermaid accepts small flow and sequence diagrams and rejects directives or oversized input", () => {
  assert.equal(isSafeSmallMermaid("flowchart LR\n  A[Request] --> B[Review]"), true);
  assert.equal(isSafeSmallMermaid("sequenceDiagram\n  Admin->>Officer: Review\n  Officer-->>Admin: Reply"), true);
  assert.equal(isSafeSmallMermaid("flowchart LR\n  %%{init: { securityLevel: 'loose' }}%%\n  A --> B"), false);
  assert.equal(isSafeSmallMermaid("flowchart LR\n  A --> B\n  click B 'javascript:alert(1)'"), false);
  assert.equal(isSafeSmallMermaid(`flowchart LR\n${"  A --> B\n".repeat(33)}`), false);
  assert.equal(isSafeSmallMermaid("pie\n  \"A\" : 1"), false);
});

test("Mermaid parser accepts valid flow and sequence syntax and rejects malformed diagrams", async () => {
  const domPurify = (await import("dompurify")).default;
  // Mermaid sanitizes labels during parsing; this parser-only Node test has no DOM.
  if (typeof domPurify.sanitize !== "function") domPurify.sanitize = (input) => input;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ securityLevel: "strict", startOnLoad: false, flowchart: { htmlLabels: false } });
  await assert.doesNotReject(() => mermaid.parse(["flowchart LR", "  A[Request] --> B[Review]"].join("\n")));
  await assert.doesNotReject(() => mermaid.parse(["sequenceDiagram", "  Admin->>Officer: Review", "  Officer-->>Admin: Reply"].join("\n")));
  await assert.rejects(() => mermaid.parse(["flowchart LR", "  A --"].join("\n")));
});

test("policy catalog eligibility checks publication state and inclusive effective dates", () => {
  const policy = {
    id: "p1", title: "Published", authority: "Board", document_type: "policy", version_label: "v2",
    effective_from: "2026-01-01", effective_until: "2026-12-31", status: "published", processing_state: "ready", active_embedding_profile: "embed-v1",
  };
  assert.equal(isUsablePolicyCatalogEntry(policy, "2026-09-23"), true);
  assert.equal(isUsablePolicyCatalogEntry({ ...policy, effective_from: "2026-10-01" }, "2026-09-23"), false);
  assert.equal(isUsablePolicyCatalogEntry({ ...policy, effective_until: "2026-09-22" }, "2026-09-23"), false);
  assert.equal(isUsablePolicyCatalogEntry({ ...policy, status: "draft" }, "2026-09-23"), false);
  assert.equal(isUsablePolicyCatalogEntry({ ...policy, active_embedding_profile: null }, "2026-09-23"), false);
});

test("catalog excludes unusable evidence and formats a metadata-only inventory", () => {
  const source = { id: "a1", original_name: "Annual report.pdf", kind: "prior_submission", report_key: "annual_report", cycle_id: "cycle-id", term_id: null, status: "ready", active_embedding_profile: "embed-v1" };
  assert.equal(isUsableAccreditationCatalogEntry(source), true);
  assert.equal(isUsableAccreditationCatalogEntry({ ...source, kind: "blank_template" }), false);
  assert.equal(isUsableAccreditationCatalogEntry({ ...source, status: "processing" }), false);
  const answer = buildSourceCatalogAnswer({
    date: "2026-09-23",
    policy: [{ id: "p1", title: "Published", authority: "Board", document_type: "policy", version_label: "v2", effective_from: "2026-01-01", effective_until: null, status: "published", processing_state: "ready", active_embedding_profile: "embed-v1" }],
    accreditation: [source],
  });
  assert.match(answer, /metadata only/);
  assert.match(answer, /\[Published\]\(<\/api\/policy\/sources\/p1\?date=2026-09-23>\)/);
  assert.match(answer, /\[Annual report\.pdf\]\(<\/api\/accreditation\/sources\/a1>\)/);
  const policyEntry = (index) => ({
    id: `p${index}`, title: "Published", authority: "Board", document_type: "policy", version_label: "v2",
    effective_from: "2026-01-01", effective_until: null, status: "published", processing_state: "ready", active_embedding_profile: "embed-v1",
  });
  const expanded = buildSourceCatalogAnswer({
    date: "2026-09-23",
    policy: Array.from({ length: 100 }, (_, index) => ({ ...policyEntry(index), title: "Published governance policy with a deliberately long name" })),
    accreditation: Array.from({ length: 100 }, (_, index) => ({ ...source, id: `a${index}`, original_name: "Annual accreditation report with a deliberately long file name.pdf" })),
  });
  assert.ok(expanded.length < 8_000);
  assert.match(expanded, /Additional policy documents/);
  assert.match(expanded, /Additional accreditation sources/);
});

test("batch embedding retries use bounded 10-20 second exponential backoff with jitter", () => {
  assert.equal(processingRetryDelayMs(0, 0), 10_000);
  assert.equal(processingRetryDelayMs(0, 1), 12_000);
  assert.equal(processingRetryDelayMs(1, 0), 20_000);
  assert.equal(processingRetryDelayMs(8, 0.5), 20_000);
});
