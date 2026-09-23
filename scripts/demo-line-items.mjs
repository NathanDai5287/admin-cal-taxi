// Demo: every rounding case for buildLineItems, with real pricing constants.
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../app/(admin)/host/documents/build-line-items.ts", import.meta.url), "utf8");
const standalone = source.replace(
  /import \{ roundCents \} from [^;]+;/,
  "const roundCents = n => Math.round(n * 100) / 100;");
const compiled = ts.transpileModule(standalone, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildLineItems } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

// Real constants: base 150; 200 guests -> capacity (200-20)*2 = 360; permit 125;
// beer & wine 50; average protection 50; 'Had plans' 125; light setup 25; full cleanup 200.
const FULL = {
  base: 150, guests: 200, capacityThreshold: 20, capacity: 360, firePermit: 125,
  alcohol: 50, alcoholLabel: "Beer & wine",
  protection: 50, protectionLabel: "Average",
  date: 125, dateLabel: "Had plans",
  setup: 25, setupLabel: "Light setup",
  cleanup: 200, cleanupLabel: "Full",
}; // raw sum 1085

// Minimal: 10 guests, full cleanup only -> base 150 + cleanup 200.
const MIN = {
  base: 150, guests: 10, capacityThreshold: 20, capacity: 0, firePermit: 0,
  alcohol: 0, protection: 0, date: 0, setup: 0, cleanup: 200, cleanupLabel: "Full",
}; // raw sum 350

const cases = [
  ["A. round total (multiple of 10)", FULL, 1360],
  ["B. total ends in 5 (pool aim lands round)", FULL, 1355],
  ["C. non-round total, no cents", FULL, 1357],
  ["D. total with cents", FULL, 1356.25],
  ["E. deep discount (~45% off raw)", FULL, 600],
  ["F. steep discount -> $0-rounding guard (exact cents)", FULL, 400],
  ["G. total below pinned fees -> degenerate scale-all", FULL, 200],
  ["H. single scalable line, cents total", MIN, 333.33],
  ["I. single scalable line, round pool aim", MIN, 400],
];

for (const [label, bd, target] of cases) {
  const items = buildLineItems(bd, target, "October 3, 2026");
  const total = items.reduce((s, i) => s + parseFloat(i.amount), 0);
  console.log(`\n=== ${label}: target $${target} (raw sum $${bd.base + bd.capacity + bd.firePermit + bd.alcohol + bd.protection + bd.date + bd.setup + bd.cleanup}) ===`);
  for (const it of items) console.log("  " + it.amount.padStart(8) + "  " + it.description);
  console.log("  " + "--------");
  console.log("  " + total.toFixed(2).padStart(8) + "  TOTAL " + (Math.abs(total - target) < 1e-9 ? "(exact)" : `(OFF BY ${total - target})`));
}
