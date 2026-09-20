import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manual expense receipt image is optional", async () => {
  const [actions, form] = await Promise.all([
    readFile(new URL("../app/(admin)/finance/accounts/activity/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/accounts/activity/manual-expense-form.tsx", import.meta.url), "utf8"),
  ]);

  // An empty file input arrives as a zero-byte File and must skip validation
  // and the storage upload entirely.
  assert.match(actions, /receipt instanceof File && receipt\.size > 0/);
  assert.doesNotMatch(actions, /receipt\.size === 0/);

  // The form presents the receipt as optional and never requires it.
  assert.match(form, /Receipt image \(optional\)/);
  const inputBlock = form.slice(form.indexOf("<PasteImageInput"), form.indexOf("/>", form.indexOf("<PasteImageInput")));
  assert.doesNotMatch(inputBlock, /required/);
});

test("a chosen or pasted image can be removed before submitting", async () => {
  const pasteInput = await readFile(new URL("../components/forms/paste-image-input.tsx", import.meta.url), "utf8");

  assert.match(pasteInput, /Remove image/);
  assert.match(pasteInput, /input\.value = ""/);
});
