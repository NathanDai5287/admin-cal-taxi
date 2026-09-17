import assert from "node:assert/strict";
import test from "node:test";

import { replaceImagePreviewUrl } from "../lib/reimbursements/image-preview.ts";

test("creates a preview URL for the selected image", () => {
  const calls = [];
  const image = new Blob(["image"], { type: "image/png" });
  const objectUrlApi = {
    createObjectURL(value) {
      calls.push(["create", value]);
      return "blob:preview";
    },
    revokeObjectURL(value) {
      calls.push(["revoke", value]);
    },
  };

  assert.equal(replaceImagePreviewUrl("", image, objectUrlApi), "blob:preview");
  assert.deepEqual(calls, [["create", image]]);
});

test("revokes the previous preview before replacing it", () => {
  const calls = [];
  const image = new Blob(["replacement"], { type: "image/jpeg" });
  const objectUrlApi = {
    createObjectURL() {
      calls.push(["create"]);
      return "blob:replacement";
    },
    revokeObjectURL(value) {
      calls.push(["revoke", value]);
    },
  };

  assert.equal(replaceImagePreviewUrl("blob:previous", image, objectUrlApi), "blob:replacement");
  assert.deepEqual(calls, [["revoke", "blob:previous"], ["create"]]);
});

test("revokes the preview when the image is cleared", () => {
  const revoked = [];
  const objectUrlApi = {
    createObjectURL() {
      return "blob:unused";
    },
    revokeObjectURL(value) {
      revoked.push(value);
    },
  };

  assert.equal(replaceImagePreviewUrl("blob:preview", undefined, objectUrlApi), "");
  assert.deepEqual(revoked, ["blob:preview"]);
});
