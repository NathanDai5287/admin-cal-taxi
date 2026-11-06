import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { PDFDocument } from "pdf-lib";
import { accreditationDocumentSchema, exampleDocumentName, uniqueDocumentName, documentTableTotals } from "../lib/accreditation/document.ts";

test("explicit table totals use decimal arithmetic and reject unknown values", () => {
  const table = { id: "t", type: "table", headers: ["Amount"], rows: [["0.10"],["0.20"]], totalColumns: [0] };
  assert.deepEqual(documentTableTotals(table), ["0.30"]);
  assert.throws(() => documentTableTotals({ ...table, rows: [["[Confirm amount]"]] }), /numeric value/);
  assert.throws(() => documentTableTotals({ ...table, rows: [["1,2"]] }), /numeric value/);
  assert.deepEqual(documentTableTotals({ ...table, rows: [["1,234.50"],["-34.50"]] }), ["1200.00"]);
  assert.equal(documentTableTotals({ ...table, totalColumns: [] }), null);
});

test("batch names preserve filenames and disambiguate case-insensitively", () => {
  assert.equal(exampleDocumentName("Annual_Budget.XLSX"), "Annual Budget");
  assert.equal(uniqueDocumentName("Budget", ["budget", "Budget (2)"]), "Budget (3)");
  assert.ok(uniqueDocumentName("x".repeat(160), ["x".repeat(160)]).length <= 160);
});

test("documents reject duplicate block IDs and malformed table rows", () => {
  const header = { version: 1, title: "Report", period: "2026" };
  assert.equal(accreditationDocumentSchema.safeParse({ ...header, blocks: [{ id: "a", type: "paragraph", text: "One" }, { id: "a", type: "paragraph", text: "Two" }] }).success, false);
  assert.equal(accreditationDocumentSchema.safeParse({ ...header, blocks: [{ id: "a", type: "table", headers: ["Amount", "Purpose"], rows: [["10"]] }] }).success, false);
});

test("Typst renders flowing text, tables, Greek letters and literal markup", async () => {
  const document = accreditationDocumentSchema.parse({ version: 1, title: "ΘΞ Chapter report", period: "2026–27", blocks: [
    { id: "h", type: "heading", level: 1, text: "Philanthropy" },
    { id: "p", type: "paragraph", text: '#include "secret.typ" — this is literal text.' },
    { id: "l", type: "list", ordered: true, items: ["First", "Second"] },
    { id: "t", type: "table", headers: ["Event", "Amount"], rows: Array.from({ length: 100 }, (_, i) => [`Event ${i}`, "$100.00"]) },
    { id: "b", type: "page_break" },
    { id: "s", type: "signature", label: "Officer signature" },
  ] });
  const root = path.resolve("lib/accreditation/pdf");
  const fontPath = path.resolve("lib/host-pdf/fonts");
  const compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontBlobs: readdirSync(fontPath).filter(name => name.endsWith(".ttf")).map(name => readFileSync(path.join(fontPath, name))) }] });
  const compiled = compiler.compile({ mainFilePath: path.join(root, "document.typ"), inputs: { document: JSON.stringify(document) } });
  assert.ok(compiled.result, JSON.stringify(compiled.takeError()?.shortDiagnostics));
  const pdf = await PDFDocument.load(compiler.pdf(compiled.result));
  assert.ok(pdf.getPageCount() >= 3);
});
