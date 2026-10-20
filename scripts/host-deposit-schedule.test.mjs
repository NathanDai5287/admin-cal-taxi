import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const compiled = await build({
  stdin: { contents: `export { orderDepositReturnDueDate } from "./lib/host-payment-schedule";`, resolveDir: root },
  bundle: true, write: false, platform: "node", format: "cjs",
});
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled.outputFiles[0].text}\n})`)(createRequire(path.join(root, "package.json")), compiledModule, compiledModule.exports);
const { orderDepositReturnDueDate } = compiledModule.exports;
const order = { eventDate: "2026-10-16", rentalPrice: 1400, snapshot: { startTime: "20:00", endTime: "01:00" } };

test("deposit return targets start after both event conclusion and full rental receipt", () => {
  const received = date => [{ date, amount: 1400 }];
  assert.equal(orderDepositReturnDueDate(order, received("2026-10-15")), "2026-10-20");
  assert.equal(orderDepositReturnDueDate(order, received("2026-10-19")), "2026-10-21");
  assert.equal(orderDepositReturnDueDate(order, [{ date: "2026-10-22", amount: 400 }, { date: "2026-10-19", amount: 1000 }]), "2026-10-26");
  assert.equal(orderDepositReturnDueDate(order, [{ date: "2026-10-19", amount: 1000 }]), null);
  assert.equal(orderDepositReturnDueDate({ ...order, eventDate: "2026-12-31" }, received("2026-12-30")), "2027-01-05");
  assert.equal(orderDepositReturnDueDate({ ...order, eventDate: "2026-03-07" }, received("2026-03-06")), "2026-03-10");
});
