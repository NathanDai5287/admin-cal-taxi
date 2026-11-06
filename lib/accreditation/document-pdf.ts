import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NodeCompiler, PdfStandard } from "@myriaddreamin/typst-ts-node-compiler";
import { accreditationDocumentSchema, documentTableTotals } from "./document";

export function renderAccreditationDocument(value: unknown) {
  const document = accreditationDocumentSchema.parse(value);
  const root = path.join(process.cwd(), "lib/accreditation/pdf");
  const fonts = path.join(process.cwd(), "lib/host-pdf/fonts");
  const compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontBlobs: readdirSync(fonts).filter(name => name.endsWith(".ttf")).map(name => readFileSync(path.join(fonts, name))) }] });
  const rendered = { ...document, blocks: document.blocks.map(block => block.type === "table" ? { ...block, rows: [...block.rows, ...(documentTableTotals(block) ? [documentTableTotals(block)!] : [])] } : block) };
  const compiled = compiler.compile({ mainFilePath: path.join(root, "document.typ"), inputs: { document: JSON.stringify(rendered) } });
  if (!compiled.result) throw new Error(`Accreditation PDF could not be rendered: ${JSON.stringify(compiled.takeError()?.shortDiagnostics)}`);
  return compiler.pdf(compiled.result, { pdfStandard: PdfStandard.V_1_7, pdfTags: true });
}
