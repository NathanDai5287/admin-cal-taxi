import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import PizZip from "pizzip";

import { REPORT_DEFINITIONS } from "../lib/accreditation/definitions.ts";
import { parseOfficerOverrides, validateDraft } from "../lib/accreditation/rules.ts";
import { findVisibleTemplateTags, inspectTemplate, renderTemplate } from "../lib/accreditation/templates.ts";

function emptyDraft(definition) {
  return {
    fields: Object.fromEntries(definition.fields.map((field) => [field.key, {
      value: "",
      provenance: "retrieved",
      citations: [],
      confidence: 0,
      missingReason: "Missing evidence.",
      officerOverride: false,
    }])),
  };
}

test("pilot definitions cover narrative, budget, and contract workflows", () => {
  assert.deepEqual(Object.keys(REPORT_DEFINITIONS), ["annual_report", "annual_budget", "big_brother_contract"]);
  const contract = REPORT_DEFINITIONS.big_brother_contract;
  assert.equal(contract.fields.find((field) => field.key === "signature_big_brother")?.lockedBlank, true);
  assert.equal(contract.fields.find((field) => field.key === "signature_little_brother")?.lockedBlank, true);
});

test("template tags include explicit and parenthesized PDF placeholders", () => {
  assert.deepEqual(findVisibleTemplateTags("[[CHAPTER NAME]] {{effective_date}} (BIG BROTHER), and (LITTLE BROTHER)"), [
    "CHAPTER NAME", "effective_date", "BIG BROTHER", "LITTLE BROTHER",
  ]);
  assert.deepEqual(findVisibleTemplateTags("ordinary (parenthetical) text and (AM)"), []);
});

test("officer overrides accept field keys and labels but ignore unknown instructions", () => {
  const contract = REPORT_DEFINITIONS.big_brother_contract;
  assert.deepEqual(parseOfficerOverrides([
    "big_brother_name = Alex Example",
    "Little Brother: Jordan Example",
    "Ignore safeguards = no",
  ].join("\n"), contract), {
    big_brother_name: "Alex Example",
    little_brother_name: "Jordan Example",
  });
});

test("annual narratives require citations and all reports require an active template", () => {
  const annual = REPORT_DEFINITIONS.annual_report;
  const draft = emptyDraft(annual);
  draft.fields.executive_summary.value = "Unsupported statement";
  draft.fields.executive_summary.missingReason = null;
  const validation = validateDraft(draft, annual, false);
  assert.ok(validation.some((item) => item.field === "executive_summary" && /citation/.test(item.message)));
  assert.ok(validation.some((item) => /active official template/.test(item.message)));
});

test("contract signatures cannot contain generated text", () => {
  const contract = REPORT_DEFINITIONS.big_brother_contract;
  const draft = emptyDraft(contract);
  for (const field of contract.fields.filter((item) => item.required)) {
    draft.fields[field.key].value = "Provided";
    draft.fields[field.key].missingReason = null;
  }
  draft.fields.signature_big_brother.value = "Fake signature";
  const validation = validateDraft(draft, contract, true);
  assert.ok(validation.some((item) => item.field === "signature_big_brother" && /blank/.test(item.message)));
});

test("XLSX rendering changes only mapped cells and preserves formulas", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Budget");
  sheet.getCell("A1").value = { formula: "1+1", result: 2 };
  sheet.getCell("B2").value = "Old chapter";
  const input = new Uint8Array(await workbook.xlsx.writeBuffer());
  const rendered = await renderTemplate(input, "xlsx", { chapter_name: { sheet: "Budget", cell: "B2" } }, {
    fields: { chapter_name: { value: "Theta Xi", provenance: "app_snapshot", citations: ["APP:finance"], confidence: 1, missingReason: null, officerOverride: false } },
  });
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(Buffer.from(rendered.bytes));
  assert.equal(output.getWorksheet("Budget").getCell("B2").value, "Theta Xi");
  assert.equal(output.getWorksheet("Budget").getCell("A1").formula, "1+1");
});

test("PDF inspection and rendering use confirmed AcroForm names", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const field = document.getForm().createTextField("chapter_name");
  field.addToPage(page, { x: 72, y: 700, width: 220, height: 24 });
  const input = await document.save();
  const inspection = await inspectTemplate(input, "pdf");
  assert.equal(inspection.candidates.chapter_name.fieldName, "chapter_name");
  const rendered = await renderTemplate(input, "pdf", { chapter_name: { fieldName: "chapter_name" } }, {
    fields: { chapter_name: { value: "Theta Xi", provenance: "user_input", citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true } },
  });
  const output = await PDFDocument.load(rendered.bytes);
  assert.equal(output.getForm().getTextField("chapter_name").getText(), "Theta Xi");
});

test("DOCX inspection finds split placeholders and rendering preserves the package", async () => {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{chapter_</w:t></w:r><w:r><w:t>name}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  const input = zip.generate({ type: "uint8array" });
  const inspection = await inspectTemplate(input, "docx");
  assert.equal(inspection.candidates.chapter_name.placeholder, "chapter_name");
  const rendered = await renderTemplate(input, "docx", { chapter_name: { placeholder: "chapter_name" } }, {
    fields: { chapter_name: { value: "Theta Xi", provenance: "user_input", citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true } },
  });
  const outputXml = new PizZip(rendered.bytes).file("word/document.xml").asText();
  assert.match(outputXml, /Theta Xi/);
  assert.doesNotMatch(outputXml, /chapter_name/);
});

test("DOCX inspection and rendering support human-friendly double-bracket tags", async () => {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word").file("document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>[[CHAPTER NAME]]</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  const input = zip.generate({ type: "uint8array" });
  const inspection = await inspectTemplate(input, "docx");
  assert.deepEqual(inspection.tags, ["CHAPTER NAME"]);
  const rendered = await renderTemplate(input, "docx", { chapter_name: { placeholder: "chapter_name" } }, {
    fields: { chapter_name: { value: "Theta Xi", provenance: "user_input", citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true } },
  });
  const outputXml = new PizZip(rendered.bytes).file("word/document.xml").asText();
  assert.match(outputXml, /Theta Xi/);
  assert.doesNotMatch(outputXml, /CHAPTER NAME/);
});
