import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["lib/alumni-connect/model.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  identitySchema,
  invitationBatchSchema,
  acceptanceSchema,
  parseEmailPaste,
  invitationCopy,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
test("inviters can provide any subset of profile fields; recipients may correct defaults", () => {
  const batch = invitationBatchSchema.parse({
    include_name: false,
    recipients: [
      { email: "ALEX@example.com", roll_number: "nu1048" },
      {
        email: "sam@example.com",
        graduation_year: "2027",
        last_name: "Brother",
      },
    ],
  });
  assert.deepEqual(batch.recipients[0], {
    email: "alex@example.com",
    first_name: "",
    last_name: "",
    roll_number: "Nu 1048",
    graduation_year: null,
  });
  const accepted = acceptanceSchema.parse({
    ...batch.recipients[0],
    first_name: "Alex",
    last_name: "Corrected",
    roll_number: "Nu 1049",
    consent: true,
  });
  assert.equal(accepted.roll_number, "Nu 1049");
  assert.equal(batch.recipients[0].roll_number, "Nu 1048");
});
test("malformed identity fields, missing consent and oversized batches are rejected", () => {
  assert.equal(
    identitySchema.safeParse({ roll_number: "Nu -1" }).success,
    false,
  );
  assert.equal(
    identitySchema.safeParse({ graduation_year: 1800 }).success,
    false,
  );
  assert.equal(
    acceptanceSchema.safeParse({
      email: "alex@example.com",
      first_name: "Alex",
      last_name: "Brother",
      consent: false,
    }).success,
    false,
  );
  assert.throws(() =>
    parseEmailPaste(
      Array.from({ length: 21 }, (_, i) => `a${i}@example.com`).join(","),
    ),
  );
});
test("email paste normalizes and deduplicates without accepting malformed addresses", () => {
  assert.deepEqual(
    parseEmailPaste(
      "ALEX@example.com, alex@example.com; sam@example.com\n",
    ).map((r) => r.email),
    ["alex@example.com", "sam@example.com"],
  );
  assert.throws(() => parseEmailPaste("valid@example.com, invalid@"));
});
test("anonymous invitation copy does not leak the inviter's name", () => {
  assert.doesNotMatch(
    JSON.stringify(invitationCopy("Private Brother", false)),
    /Private|Brother/,
  );
  const copy = invitationCopy("Nathan Dai", true);
  assert.match(copy.subject, /Nathan invited/);
  assert.match(copy.introduction, /Nathan Dai/);
});
