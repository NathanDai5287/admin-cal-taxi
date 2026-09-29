import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = specifier.startsWith("./host-") ? `${specifier}.ts` : specifier;
    return nextResolve(source, context);
  },
});

const { buildContractPayload, buildDepositPayload } = await import("../lib/host-documents.ts");
const { effective, liveBreakdown } = await import("../lib/host-derive.ts");

function eventWithGuests(numGuests) {
  return {
    numGuests,
    clubs: ["Test Organization"],
    eventDate: "2026-10-15",
    areas: {},
    cleared: {},
    maxGuests: "350",
    overrides: { maxGuests: true },
    pricingSelections: {
      alcohol: 0, protection: 0, date: 0, setup: 0,
      cleanup: 0, wealth: 0, relationship: 0,
    },
  };
}

for (const [guestCount, contractLimit] of [["30", "200"], ["199", "200"], ["200", "200"], ["201", "201"], ["350", "350"]]) {
  test(`${guestCount} entered guests produce a ${contractLimit} contract limit`, () => {
    const event = eventWithGuests(guestCount);
    const original = structuredClone(event);
    const contract = buildContractPayload(event, { sign: false });
    const deposit = buildDepositPayload(event, {
      amount: "100", issueDate: "2026-10-01", dueDate: "2026-10-08",
    });

    assert.equal(contract.max_guests, contractLimit);
    assert.equal(deposit.max_guests, contractLimit);
    assert.equal(effective(event, "maxGuests"), guestCount);
    assert.deepEqual(event, original);
  });
}

test("fire permit pricing uses entered guests, despite the contract minimum and old override", () => {
  assert.equal(liveBreakdown(eventWithGuests("50")).firePermit, 0);
  assert.equal(liveBreakdown(eventWithGuests("51")).firePermit, 125);
});

test("an empty guest input stays empty in the interface", () => {
  assert.equal(effective(eventWithGuests(""), "maxGuests"), "");
  assert.equal(liveBreakdown(eventWithGuests("")), null);
});
