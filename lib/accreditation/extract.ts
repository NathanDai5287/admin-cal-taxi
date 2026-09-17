import "server-only";

import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import PizZip from "pizzip";

import type { ExtractedChunk } from "./types";
import type { OcrProvider } from "./providers";

const MAX_CHUNK_CHARS = 3_500;
const MAX_EXTRACTED_CHARS = 5_000_000;
const MAX_CHUNKS = 2_000;

function assertReasonableExtraction(chunks: ExtractedChunk[]) {
  const characters = chunks.reduce((total, chunk) => total + chunk.content.length, 0);
  if (chunks.length > MAX_CHUNKS || characters > MAX_EXTRACTED_CHARS) {
    throw new Error("The document expands beyond the safe processing limit.");
  }
  return chunks;
}

function assertSafeOfficeArchive(bytes: Uint8Array) {
  const zip = new PizZip(bytes);
  const entries = Object.values(zip.files) as Array<{ dir: boolean; _data?: { uncompressedSize?: number } }>;
  const total = entries.reduce((sum, entry) => sum + Number(entry._data?.uncompressedSize ?? 0), 0);
  if (entries.length > 20_000 || total > 100 * 1024 * 1024) {
    throw new Error("The Office document expands beyond the safe processing limit.");
  }
}

function chunkText(text: string, locator: Record<string, string | number> = {}) {
  const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: ExtractedChunk[] = [];
  let buffer = "";
  let startParagraph = 1;
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (buffer && buffer.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      chunks.push({ ordinal: chunks.length, content: buffer, locator: { ...locator, paragraph: startParagraph } });
      buffer = "";
      startParagraph = index + 1;
    }
    buffer += `${buffer ? "\n\n" : ""}${paragraph}`;
  }
  if (buffer) chunks.push({ ordinal: chunks.length, content: buffer, locator: { ...locator, paragraph: startParagraph } });
  return chunks;
}

function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

export function validateSourceFile(file: File) {
  const name = file.name.toLowerCase();
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Files must be between 1 byte and 25 MB.");
  if (name.endsWith(".docm") || name.endsWith(".xlsm")) throw new Error("Macro-enabled Office files are not accepted.");
  const supported = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".csv", ".json"].some((extension) => name.endsWith(extension));
  if (!supported) throw new Error("Use PDF, DOCX, XLSX, TXT, Markdown, CSV, or JSON files.");
}

export async function extractSource(bytes: Uint8Array, filename: string, mimeType: string, ocr: OcrProvider | null) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".json")) {
    return assertReasonableExtraction(chunkText(new TextDecoder().decode(bytes)));
  }
  if (lower.endsWith(".docx")) {
    if (!isZip(bytes)) throw new Error("The DOCX file is not a valid Office document.");
    assertSafeOfficeArchive(bytes);
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return assertReasonableExtraction(chunkText(result.value));
  }
  if (lower.endsWith(".xlsx")) {
    if (!isZip(bytes)) throw new Error("The XLSX file is not a valid Office workbook.");
    assertSafeOfficeArchive(bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as never);
    const chunks: ExtractedChunk[] = [];
    workbook.eachSheet((sheet) => {
      let rows: string[] = [];
      let firstRow = 1;
      const flush = () => {
        if (!rows.length) return;
        chunks.push({ ordinal: chunks.length, content: rows.join("\n"), locator: { sheet: sheet.name, row: firstRow } });
        rows = [];
      };
      sheet.eachRow((row, rowNumber) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, column) => {
          const value = cell.text.trim();
          if (value) cells.push(`${sheet.getColumn(column).letter}${rowNumber}: ${value}`);
        });
        if (!cells.length) return;
        if (!rows.length) firstRow = rowNumber;
        rows.push(cells.join(" | "));
        if (rows.join("\n").length >= MAX_CHUNK_CHARS) flush();
      });
      flush();
    });
    return assertReasonableExtraction(chunks);
  }
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    if (!isPdf(bytes)) throw new Error("The PDF signature is invalid or the file is encrypted.");
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    if (pdf.getPageCount() > 200) throw new Error("PDF sources are limited to 200 pages.");
    if (!ocr) throw new Error("PDF extraction requires the configured OCR provider.");
    return assertReasonableExtraction(await ocr.extract(bytes, filename, mimeType));
  }
  throw new Error("This file type cannot be extracted.");
}
