import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({ entryPoints: ["lib/mailing-list/contacts.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { contactSchema, contactSearchFilters, parseContactText, previewContacts, guessColumns, MAX_IMPORT_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const preview = (text, headers = true) => {
  const rows = parseContactText(text);
  return previewContacts(rows, guessColumns(rows[0], headers), headers);
};

test("CSV handles BOM, CRLF, quoted commas, doubled quotes, multiline fields, and blanks", () => {
  assert.deepEqual(parseContactText('\uFEFFFname,Lname,Email,Phone\r\n" Alex ","O""Neil, Jr.",alex@example.com,"(510) 555-0123"\r\n\r\n"Sam\nLee",Wu,sam@example.com,\r\n'), [
    ["Fname", "Lname", "Email", "Phone"], ["Alex", 'O"Neil, Jr.', "alex@example.com", "(510) 555-0123"], ["Sam\nLee", "Wu", "sam@example.com", ""],
  ]);
});

test("spreadsheet tabs, semicolons, and headerless rows work", () => {
  for (const separator of ["\t", ";"]) {
    const p = preview(["First Name", "Last Name", "Email Address", "Mobile"].join(separator) + "\n" + ["Alex", "Smith", "ALEX@example.com", "510-555-0123"].join(separator));
    assert.equal(p.contacts[0].email, "alex@example.com");
    assert.equal(p.contacts[0].last_name, "Smith");
  }
  assert.equal(preview("Alex,Smith,alex@example.com,", false).contacts.length, 1);
  assert.equal(preview("First name,Email\nAlex,alex@example.com").contacts.length, 1);
});

test("preview validates rows and skips normalized duplicate emails and phone-only contacts", () => {
  const p = preview("Fname,Lname,email,phone\nAlex,Smith,ALEX@example.com,\nAlex,Smith,alex@example.com,\nSam,Lee,,(510) 555-0123\nSam,Lee,,5105550123\nBad,Email,not-an-email,\nMissing,Contact,,\n,Name,no-name@example.com,\nPhone,Bad,,123");
  assert.equal(p.contacts.length, 2);
  assert.equal(p.duplicates, 2);
  assert.deepEqual(p.errors.map((error) => error.row), [6, 7, 8, 9]);
});

test("custom column matching works and prevents overlapping or missing required matches", () => {
  const rows = parseContactText("Other,Person,Family,Address\nignored,Alex,Smith,alex@example.com");
  assert.equal(previewContacts(rows, { first_name: 1, last_name: 2, email: 3, phone: -1 }, true).contacts.length, 1);
  assert.match(previewContacts(rows, { first_name: 1, last_name: 1, email: 3, phone: -1 }, true).problem, /different column/);
  assert.match(previewContacts(rows, guessColumns(rows[0], true), true).problem, /Match a first name/);
});

test("malformed, empty, oversized, and over-limit files fail before importing", () => {
  for (const text of ['Fname,email\n"Alex,alex@example.com', 'Fname,email\n"Alex"oops,alex@example.com', 'Fname,email\nAl"ex,alex@example.com', " \n\r\n"]) assert.throws(() => parseContactText(text));
  assert.throws(() => parseContactText("x".repeat(MAX_IMPORT_BYTES + 1)), /2 MB/);
  assert.throws(() => parseContactText("x,".repeat(100) + "x"), /100 columns/);
  assert.throws(() => parseContactText("Fname,Email\n" + "Alex,alex@example.com\n".repeat(10001)), /10,000/);
  assert.match(preview("Fname,Email").problem, /no contacts/);
});

test("server input validation strips unknown fields and enforces lengths and contact details", () => {
  const input = { first_name: " Alex ", last_name: " Smith ", email: " ALEX@EXAMPLE.COM ", phone: "", role: "admin" };
  assert.deepEqual(contactSchema.parse(input), { first_name: "Alex", last_name: "Smith", email: "alex@example.com", phone: "" });
  assert.equal(contactSchema.safeParse({ ...input, first_name: "a".repeat(101) }).success, false);
  assert.equal(contactSchema.safeParse({ ...input, email: "", phone: "" }).success, false);
  assert.equal(contactSchema.safeParse({ ...input, phone: "call me later" }).success, false);
});

test("phone is optional for individual entry and CSV import with an email address", () => {
  assert.equal(contactSchema.parse({ first_name: "Alex", last_name: "Smith", email: "alex@example.com" }).phone, "");
  assert.equal(contactSchema.parse({ first_name: "Alex", last_name: "Smith", email: "alex@example.com", phone: "" }).phone, "");
  const result = preview("Fname,Lname,Email\nAlex,Smith,alex@example.com");
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].phone, "");
  assert.deepEqual(result.errors, []);
});

test("phone searches match different punctuation while full names keep both name tokens", () => {
  for (const phone of ["510-555-0123", "(510) 555-0123", "510.555.0123", "5105550123"]) {
    assert.deepEqual(contactSearchFilters(phone), ["phone_digits.ilike.%5105550123%"]);
  }
  const names = contactSearchFilters("Alex O'Neil");
  assert.equal(names.length, 3);
  assert.match(names[0], /first_name.ilike.%Alex%/);
  assert.match(names[2], /last_name.ilike.%Neil%/);
  assert.equal(contactSearchFilters('Alex),email.neq.""').some((filter) => filter.includes("neq.")), false);
});
