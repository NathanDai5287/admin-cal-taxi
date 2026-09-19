import assert from "node:assert/strict";
import test from "node:test";

import {
  isImageAttachment,
  isSupportedChatAttachment,
  keepSupportedCitations,
  selectClosestContexts,
} from "../lib/accreditation/chat.ts";

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
