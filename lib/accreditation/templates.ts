import Docxtemplater from "docxtemplater";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import PizZip from "pizzip";

import type {
  RenderedTemplate,
  ReportDraft,
  TemplateFormat,
  TemplateInspection,
  TemplateMapping,
} from "./types";

const MIME_TYPES: Record<TemplateFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function templateFormatFromName(name: string): TemplateFormat | null {
  const extension = name.toLowerCase().split(".").pop();
  return extension === "pdf" || extension === "docx" || extension === "xlsx" ? extension : null;
}

export function validateTemplateFile(file: File) {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Templates must be between 1 byte and 25 MB.");
  const format = templateFormatFromName(file.name);
  if (!format) throw new Error("Templates must be PDF, DOCX, or XLSX files.");
  return format;
}

async function inspectPdf(bytes: Uint8Array): Promise<TemplateInspection> {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const candidates: TemplateMapping = {};
  for (const field of document.getForm().getFields()) {
    const name = field.getName();
    candidates[name] = { type: "text", fieldName: name };
  }
  return {
    format: "pdf",
    candidates,
    warnings: Object.keys(candidates).length ? [] : ["No fillable PDF fields were found. Confirm coordinate mappings before activation."],
  };
}

function inspectDocx(bytes: Uint8Array): TemplateInspection {
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  // Word may split one placeholder across several text runs. Removing markup
  // joins those runs again before candidate detection; Docxtemplater performs
  // the actual XML-safe replacement later.
  const visibleText = xml.replace(/<[^>]+>/g, "");
  const tags = [...visibleText.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]);
  return {
    format: "docx",
    candidates: Object.fromEntries([...new Set(tags)].map((tag) => [tag, { placeholder: tag }])),
    warnings: tags.length ? [] : ["No {{field_name}} placeholders were found. Add placeholders to a mapped copy before activation."],
  };
}

async function inspectXlsx(bytes: Uint8Array): Promise<TemplateInspection> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  const candidates: TemplateMapping = {};
  for (const item of workbook.definedNames.model) {
    const range = item.ranges?.[0];
    if (!item.name || !range) continue;
    const match = /^'?(.+?)'?\!\$?([A-Z]+)\$?(\d+)$/.exec(range);
    if (match) candidates[item.name] = { sheet: match[1].replace(/''/g, "'"), cell: `${match[2]}${match[3]}` };
  }
  return {
    format: "xlsx",
    candidates,
    warnings: Object.keys(candidates).length ? [] : ["No named cells were found. Confirm sheet-and-cell mappings before activation."],
  };
}

export async function inspectTemplate(bytes: Uint8Array, format: TemplateFormat) {
  if (format === "pdf") return inspectPdf(bytes);
  if (format === "docx") return inspectDocx(bytes);
  return inspectXlsx(bytes);
}

function draftValues(draft: ReportDraft) {
  return Object.fromEntries(Object.entries(draft.fields).map(([key, field]) => [key, field.value]));
}

function renderDocx(bytes: Uint8Array, mapping: TemplateMapping, draft: ReportDraft): RenderedTemplate {
  const values = draftValues(draft);
  const data: Record<string, string> = { ...values };
  for (const [fieldKey, fieldMapping] of Object.entries(mapping)) {
    if (fieldMapping.placeholder) data[fieldMapping.placeholder] = values[fieldKey] ?? "";
  }
  const template = new Docxtemplater(new PizZip(bytes), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  template.render(data);
  return { bytes: template.getZip().generate({ type: "uint8array" }), mimeType: MIME_TYPES.docx, extension: "docx" };
}

async function renderXlsx(bytes: Uint8Array, mapping: TemplateMapping, draft: ReportDraft): Promise<RenderedTemplate> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  const values = draftValues(draft);
  for (const [fieldKey, fieldMapping] of Object.entries(mapping)) {
    if (!fieldMapping.sheet || !fieldMapping.cell) continue;
    const sheet = workbook.getWorksheet(fieldMapping.sheet);
    if (!sheet) throw new Error(`Mapped worksheet not found: ${fieldMapping.sheet}`);
    sheet.getCell(fieldMapping.cell).value = values[fieldKey] ?? "";
  }
  const output = await workbook.xlsx.writeBuffer();
  return { bytes: new Uint8Array(output), mimeType: MIME_TYPES.xlsx, extension: "xlsx" };
}

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line += `${line ? " " : ""}${word}`;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderPdf(bytes: Uint8Array, mapping: TemplateMapping, draft: ReportDraft): Promise<RenderedTemplate> {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const form = document.getForm();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const values = draftValues(draft);
  for (const [fieldKey, fieldMapping] of Object.entries(mapping)) {
    const value = values[fieldKey] ?? "";
    if (fieldMapping.fieldName) {
      try {
        form.getTextField(fieldMapping.fieldName).setText(value);
      } catch {
        throw new Error(`Mapped PDF text field not found: ${fieldMapping.fieldName}`);
      }
      continue;
    }
    if (fieldMapping.page && fieldMapping.x !== undefined && fieldMapping.y !== undefined) {
      const page = document.getPages()[fieldMapping.page - 1];
      if (!page) throw new Error(`Mapped PDF page not found: ${fieldMapping.page}`);
      const size = fieldMapping.size ?? 10;
      const maxWidth = fieldMapping.maxWidth ?? 440;
      const characters = Math.max(15, Math.floor(maxWidth / (size * 0.55)));
      wrapText(value, characters).forEach((line, lineIndex) => {
        page.drawText(line, { x: fieldMapping.x, y: fieldMapping.y! - lineIndex * size * 1.25, size, font, color: rgb(0, 0, 0), maxWidth });
      });
    }
  }
  form.updateFieldAppearances(font);
  return { bytes: await document.save(), mimeType: MIME_TYPES.pdf, extension: "pdf" };
}

export async function renderTemplate(bytes: Uint8Array, format: TemplateFormat, mapping: TemplateMapping, draft: ReportDraft) {
  if (format === "pdf") return renderPdf(bytes, mapping, draft);
  if (format === "docx") return renderDocx(bytes, mapping, draft);
  return renderXlsx(bytes, mapping, draft);
}
