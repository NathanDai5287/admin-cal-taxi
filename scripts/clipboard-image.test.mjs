import assert from "node:assert/strict";
import test from "node:test";

import { clipboardImage } from "../lib/reimbursements/clipboard-image.ts";

function clipboardItem(kind, type, file) {
  return { kind, type, getAsFile: () => file };
}

test("returns the first clipboard image", () => {
  const image = { name: "receipt.png", type: "image/png" };
  const items = [
    clipboardItem("string", "text/plain", null),
    clipboardItem("file", "image/png", image),
  ];

  assert.equal(clipboardImage(items), image);
});

test("ignores clipboard content without an image", () => {
  const items = [
    clipboardItem("string", "text/plain", null),
    clipboardItem("file", "application/pdf", { name: "receipt.pdf" }),
  ];

  assert.equal(clipboardImage(items), null);
});
