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

const isPermit = it => it.description.startsWith("Fire permit");
const isBase = it => it.description.startsWith("Base rental");
const isPinned = it => isPermit(it) || isBase(it);

test("base rental and fire permit stay pinned at their raw amounts when scaling", () => {
  const items = buildLineItems(breakdown(), 1960, "October 3, 2026");
  assert.equal(items.find(isBase).amount, "1000.00");
  assert.equal(items.find(isPermit).amount, "125.00");
});

test("scaled items round to multiples of $10 and sum exactly to the target", () => {
  const items = buildLineItems(breakdown(), 1960, "October 3, 2026");
  assert.equal(items.length, 5);
  // The pinned $1000 base + $125 permit make the scalable pool aim at
  // 1960 − 1125 = 835, so one line absorbs the sub-$10 remainder; the
  // rest are round.
  const nonRound = items.filter(it => !isPinned(it) && !isTen(parseFloat(it.amount)));
  assert.ok(nonRound.length <= 1, `too many non-round lines: ${JSON.stringify(items)}`);
  assert.equal(sum(items), 1960);
});

test("no line moves more than $15 from its exact scaled value", () => {
  const bd = breakdown();
  const raws = [bd.capacity, bd.date, bd.cleanup]; // scalable lines, in order
  const poolRaw = raws.reduce((s, v) => s + v, 0);
  const poolAim = 1960 - bd.base - bd.firePermit;
  const items = buildLineItems(bd, 1960, "October 3, 2026").filter(it => !isPinned(it));
  items.forEach((it, i) => {
    const exact = (raws[i] * poolAim) / poolRaw;
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

test("a non-multiple-of-10 target still sums exactly, at most one non-round scalable line", () => {
  const items = buildLineItems(breakdown(), 1955, "October 3, 2026");
  assert.equal(sum(items), 1955);
  const nonRound = items.filter(it => !isPinned(it) && !isTen(parseFloat(it.amount)));
  assert.ok(nonRound.length <= 1, `too many non-round lines: ${JSON.stringify(items)}`);
});

test("negotiated total below the pinned fee falls back to scaling everything", () => {
  const items = buildLineItems(breakdown(), 100, "October 3, 2026");
  assert.ok(Math.abs(sum(items) - 100) < 1e-9, `sum ${sum(items)}`);
});

// Small event: 30 guests -> capacity (30-20)*2 = 20, no permit, full cleanup.
// The capacity fee is much smaller than cleanup, so these tests prove the
// remainder follows the capacity fee rather than the largest line.
function smallBreakdown() {
  return {
    base: 150,
    guests: 30,
    capacityThreshold: 20,
    capacity: 20,
    firePermit: 0,
    alcohol: 0,
    protection: 0,
    date: 0,
    setup: 0,
    cleanup: 200,
    cleanupLabel: "Full",
  };
}

test("sub-$10 remainder lands on the capacity fee, not the largest line", () => {
  const items = buildLineItems(smallBreakdown(), 403, "October 3, 2026");
  // pool: capacity 20 + cleanup 200, aim 253 -> exact 23.00 / 230.00;
  // the $3 remainder goes to capacity (flex), not cleanup (largest).
  assert.equal(items.find(it => it.description.startsWith("Capacity fee")).amount, "23.00");
  assert.equal(items.find(it => it.description.startsWith("Cleanup")).amount, "230.00");
  assert.equal(sum(items), 403);
});

test("cents remainder lands on the capacity fee", () => {
  const items = buildLineItems(smallBreakdown(), 403.5, "October 3, 2026");
  assert.equal(items.find(it => it.description.startsWith("Capacity fee")).amount, "23.50");
  assert.ok(Math.abs(sum(items) - 403.5) < 1e-9, `sum ${sum(items)}`);
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
