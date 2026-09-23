import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Load app/(admin)/host/documents/build-line-items.ts standalone: stub the
// one runtime import (roundCents) and transpile away the type-only ones.
async function loadBuilder() {
  const source = await readFile(
    new URL("../app/(admin)/host/documents/build-line-items.ts", import.meta.url),
    "utf8",
  );
  const standalone = source.replace(
    /import \{ roundCents \} from [^;]+;/,
    "const roundCents = n => Math.round(n * 100) / 100;",
  );
  const compiled = ts.transpileModule(standalone, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const { buildLineItems } = await loadBuilder();

function breakdown() {
  return {
    base: 1000,
    guests: 200,
    capacityThreshold: 150,
    capacity: 400,
    firePermit: 125,
    alcohol: 0,
    protection: 0,
    date: 300,
    dateLabel: "Weekend night (Fri/Sat)",
    setup: 0,
    cleanup: 260,
    cleanupLabel: "Basic",
  };
}

const sum = items => items.reduce((s, it) => s + parseFloat(it.amount), 0);
const isTen = v => Math.abs(v % 10) < 1e-9;

test("scaled items round to multiples of $10 and sum exactly to the target", () => {
  const items = buildLineItems(breakdown(), 1960, "October 3, 2026");
  assert.equal(items.length, 5);
  for (const it of items) assert.ok(isTen(parseFloat(it.amount)), `not a multiple of 10: ${it.amount}`);
  assert.equal(sum(items), 1960);
});

test("no line moves more than $15 from its exact scaled value", () => {
  const bd = breakdown();
  const raws = [bd.base, bd.capacity, bd.firePermit, bd.date, bd.cleanup];
  const rawSum = raws.reduce((s, v) => s + v, 0);
  const target = 1960;
  const items = buildLineItems(bd, target, "October 3, 2026");
  items.forEach((it, i) => {
    const exact = (raws[i] * target) / rawSum;
    assert.ok(
      Math.abs(parseFloat(it.amount) - exact) <= 15,
      `${it.description} moved ${Math.abs(parseFloat(it.amount) - exact)} from ${exact}`,
    );
  });
});

test("unscaled breakdown passes exact raw amounts through (fire permit stays $125)", () => {
  const bd = breakdown();
  const rawSum = bd.base + bd.capacity + bd.firePermit + bd.date + bd.cleanup;
  const items = buildLineItems(bd, rawSum, "October 3, 2026");
  assert.deepEqual(
    items.map(it => it.amount),
    ["1000.00", "400.00", "125.00", "300.00", "260.00"],
  );
});

test("a non-multiple-of-10 target still sums exactly, at most one non-round line", () => {
  const items = buildLineItems(breakdown(), 1955, "October 3, 2026");
  assert.equal(sum(items), 1955);
  const nonRound = items.filter(it => !isTen(parseFloat(it.amount)));
  assert.ok(nonRound.length <= 1, `too many non-round lines: ${JSON.stringify(items)}`);
});

test("sum is exact across a sweep of negotiated totals", () => {
  for (let target = 1000; target <= 3000; target += 37) {
    const items = buildLineItems(breakdown(), target, "October 3, 2026");
    assert.ok(Math.abs(sum(items) - target) < 1e-9, `target ${target}: sum ${sum(items)}`);
  }
});

test("no breakdown falls back to a single generic line at the target", () => {
  const items = buildLineItems(null, 1500, "October 3, 2026");
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, "1500.00");
  assert.match(items[0].description, /October 3, 2026/);
});
