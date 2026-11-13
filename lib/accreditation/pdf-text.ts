import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function readPdfPage(bytes: Uint8Array, pageNumber: number) {
  const loading = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const document = await loading.promise;
  try {
    if (document.numPages > 200) throw new Error("PDF sources are limited to 200 pages.");
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const operators = await page.getOperatorList();
    const items = content.items.filter((item): item is Extract<typeof item, { str: string }> => "str" in item);
    const text = items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
    const images = operators.fnArray.some((op) => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op));
    // Conservatively use vision for mixed layouts/images. Short pages with
    // real text remain valid; no character-count heuristic declares a blank.
    const rows = new Map<number, number>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 3);
      rows.set(y, (rows.get(y) ?? 0) + (item.str.trim() ? 1 : 0));
    }
    const complex = [...rows.values()].some((count) => count > 6);
    const rowItems = new Map<number, typeof items>();
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3);
      const line = rowItems.get(y) ?? []; line.push(item); rowItems.set(y, line);
    }
    const columns = [...rowItems.values()].some(line => {
      line.sort((a, b) => a.transform[4] - b.transform[4]);
      return line.some((right, i) => i > 0 && right.transform[4] - (line[i - 1].transform[4] + line[i - 1].width) > 72);
    });
    const blank = !text && operators.fnArray.length === 0;
    const native = !!text && !images && !complex && !columns && !items.some(item => item.dir === "rtl") && !/[\uFFFD\u0000-\u0008]/.test(text);
    return { text, method: blank ? "blank" : native ? "native-v1" : "ocr", pages: document.numPages };
  } finally { await loading.destroy(); }
}
