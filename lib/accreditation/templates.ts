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

export function findVisibleTemplateTags(text: string) {
  return [...text.matchAll(/\[\[\s*([^\]]+?)\s*\]\]|\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\(\s*([A-Z][A-Z0-9 _.-]{2,})\s*\)/g)]
    .map((match) => (match[1] ?? match[2] ?? match[3]).trim());
}

async function inspectPdf(bytes: Uint8Array): Promise<TemplateInspection> {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const candidates: TemplateMapping = {};
  for (const field of document.getForm().getFields()) {
    const name = field.getName();
    const kind = field.constructor.name.toLowerCase();
    candidates[name] = { type: kind.includes("checkbox") ? "checkbox" : kind.includes("radio") || kind.includes("dropdown") ? "choice" : "text", fieldName: name };
  }
  return {
    format: "pdf",
    candidates,
    warnings: Object.keys(candidates).length ? [] : ["No fillable PDF fields were found. Confirm coordinate mappings before activation."],
    inventory: `PDF pages: ${document.getPageCount()}\nAcroForm fields: ${Object.keys(candidates).join(", ") || "none"}`,
  };
}

function inspectDocx(bytes: Uint8Array): TemplateInspection {
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  // Word may split one placeholder across several text runs. Removing markup
  // joins those runs again before candidate detection; Docxtemplater performs
  // the actual XML-safe replacement later.
  const visibleText = xml.replace(/<[^>]+>/g, "");
  const tags = [
    ...[...visibleText.matchAll(/\[\[\s*([^\]]+?)\s*\]\]/g)].map((match) => match[1].trim()),
    ...[...visibleText.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]),
  ];
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((match) => match[0].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  return {
    format: "docx",
    candidates: Object.fromEntries([...new Set(tags)].map((tag) => [tag, { placeholder: tag }])),
    warnings: tags.length ? [] : ["No placeholders were found. The AI will infer answer anchors from the document structure."],
    inventory: paragraphs.map((paragraph, index) => `Paragraph ${index + 1}: ${paragraph}`).join("\n"),
    tags: [...new Set(tags)],
  };
}

async function inspectXlsx(bytes: Uint8Array): Promise<TemplateInspection> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  const candidates: TemplateMapping = {};
  const inventory: string[] = [];
  for (const item of workbook.definedNames.model) {
    const range = item.ranges?.[0];
    if (!item.name || !range) continue;
    const match = /^'?(.+?)'?\!\$?([A-Z]+)\$?(\d+)$/.exec(range);
    if (match) candidates[item.name] = { sheet: match[1].replace(/''/g, "'"), cell: `${match[2]}${match[3]}` };
  }
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        if (cell.text.trim()) cells.push(`${sheet.getColumn(column).letter}${rowNumber}: ${cell.text.trim()}`);
      });
      if (cells.length) inventory.push(`Sheet ${sheet.name}: ${cells.join(" | ")}`);
    });
  });
  return {
    format: "xlsx",
    candidates,
    warnings: Object.keys(candidates).length ? [] : ["No named cells were found. The AI will infer answer cells from labels and layout."],
    inventory: inventory.join("\n"),
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
  const sourceZip = new PizZip(bytes);
  const sourceXml = sourceZip.file("word/document.xml")?.asText();
  if (sourceXml) {
    const normalized = sourceXml.replace(/\[\[\s*([^\]]+?)\s*\]\]/g, (_match, tag: string) => `{{${tag.trim().replace(/\s+/g, "_").toLowerCase()}}}`);
    sourceZip.file("word/document.xml", normalized);
    bytes = sourceZip.generate({ type: "uint8array" });
  }
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
  let output = template.getZip().generate({ type: "uint8array" });
  const zip = new PizZip(output);
  let xml = zip.file("word/document.xml")?.asText();
  if (xml) {
    for (const [fieldKey, target] of Object.entries(mapping)) {
      if (!target.paragraph || !values[fieldKey]) continue;
      let paragraphIndex = 0;
      const value = String(values[fieldKey]).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "&#10;");
      xml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
        paragraphIndex += 1;
        if (paragraphIndex !== target.paragraph) return paragraph;
        return paragraph.replace("</w:p>", `<w:r><w:br/><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`);
      });
    }
    zip.file("word/document.xml", xml);
    output = zip.generate({ type: "uint8array" });
  }
  return { bytes: output, mimeType: MIME_TYPES.docx, extension: "docx" };
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
        if (fieldMapping.type === "checkbox") {
          const checkbox = form.getCheckBox(fieldMapping.fieldName);
          if (/^(true|1|yes|on|checked)$/i.test(value)) checkbox.check(); else checkbox.uncheck();
        } else if (fieldMapping.type === "choice") {
          try { form.getDropdown(fieldMapping.fieldName).select(value); }
          catch { form.getRadioGroup(fieldMapping.fieldName).select(value); }
        } else {
          form.getTextField(fieldMapping.fieldName).setText(value);
        }
      } catch {
        throw new Error(`Mapped PDF field not found: ${fieldMapping.fieldName}`);
      }
      continue;
    }
    if (fieldMapping.page && (fieldMapping.x !== undefined || fieldMapping.normalizedX !== undefined) && (fieldMapping.y !== undefined || fieldMapping.normalizedY !== undefined)) {
      const page = document.getPages()[fieldMapping.page - 1];
      if (!page) throw new Error(`Mapped PDF page not found: ${fieldMapping.page}`);
      const pageSize = page.getSize();
      const x = fieldMapping.normalizedX !== undefined ? fieldMapping.normalizedX * pageSize.width : fieldMapping.x!;
      const y = fieldMapping.normalizedY !== undefined ? (1 - fieldMapping.normalizedY) * pageSize.height : fieldMapping.y!;
      const width = fieldMapping.normalizedWidth !== undefined ? fieldMapping.normalizedWidth * pageSize.width : fieldMapping.width;
      const height = fieldMapping.normalizedHeight !== undefined ? fieldMapping.normalizedHeight * pageSize.height : fieldMapping.height;
      const size = fieldMapping.size ?? 10;
      const maxWidth = fieldMapping.maxWidth ?? width ?? 440;
      if (width && height) page.drawRectangle({ x, y: y - height, width, height, color: rgb(1, 1, 1) });
      if (fieldMapping.type === "checkbox") {
        if (/^(true|1|yes|on|checked)$/i.test(value)) {
          const markSize = Math.min(width ?? 10, height ?? 10);
          page.drawLine({ start: { x: x + markSize * 0.15, y: y - markSize * 0.55 }, end: { x: x + markSize * 0.42, y: y - markSize * 0.82 }, thickness: 1, color: rgb(0, 0, 0) });
          page.drawLine({ start: { x: x + markSize * 0.42, y: y - markSize * 0.82 }, end: { x: x + markSize * 0.9, y: y - markSize * 0.1 }, thickness: 1, color: rgb(0, 0, 0) });
        }
        continue;
      }
      const characters = Math.max(15, Math.floor(maxWidth / (size * 0.55)));
      wrapText(value, characters).forEach((line, lineIndex) => {
        page.drawText(line, { x, y: y - lineIndex * size * 1.25, size, font, color: rgb(0, 0, 0), maxWidth });
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
