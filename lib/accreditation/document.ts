import { z } from "zod";

const text = z.string().max(40_000);
const identity = { id: z.string().min(1).max(100) };
export const accreditationDocumentSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(160),
  period: z.string().max(160),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ ...identity, type: z.literal("heading"), text, level: z.union([z.literal(1), z.literal(2)]) }),
    z.object({ ...identity, type: z.literal("paragraph"), text }),
    z.object({ ...identity, type: z.literal("list"), ordered: z.boolean(), items: z.array(text).max(200) }),
    z.object({ ...identity, type: z.literal("table"), headers: z.array(text).min(1).max(12), rows: z.array(z.array(text).max(12)).max(500), totalColumns: z.array(z.number().int().min(0).max(11)).max(12).optional() }),
    z.object({ ...identity, type: z.literal("signature"), label: text }),
    z.object({ ...identity, type: z.literal("page_break") }),
  ])).min(1).max(500),
}).superRefine((document, context) => {
  if (JSON.stringify(document).length > 1_000_000) context.addIssue({ code: "custom", message: "This draft is too large. Split it into smaller documents." });
  const ids = new Set<string>();
  document.blocks.forEach((block, index) => {
    if (ids.has(block.id)) context.addIssue({ code: "custom", path: ["blocks", index, "id"], message: "Block IDs must be unique." });
    ids.add(block.id);
    if (block.type === "table" && block.rows.some(row => row.length !== block.headers.length)) {
      context.addIssue({ code: "custom", path: ["blocks", index, "rows"], message: "Every table row must match its headers." });
    }
    if (block.type === "table" && block.totalColumns?.some(column => column >= block.headers.length)) context.addIssue({ code: "custom", message: "Total column is outside the table." });
  });
});

export type AccreditationDocument = z.infer<typeof accreditationDocumentSchema>;

/** Only explicitly requested columns are totaled; strings must be ordinary decimals/currency. */
export function documentTableTotals(block: Extract<AccreditationDocument["blocks"][number], { type: "table" }>) {
  if (!block.totalColumns?.length) return null;
  const totals = block.headers.map(() => "");
  for (const column of block.totalColumns) {
    let cents = 0;
    for (const row of block.rows) {
      const raw = row[column].trim().replace(/^\$/, "");
      if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/.test(raw)) throw new Error(`Enter a numeric value in ${block.headers[column]} before calculating its total.`);
      const value = raw.replace(/,/g, "");
      const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
      const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(amount)) throw new Error("Table amount is too large.");
      cents += value.startsWith("-") ? -amount : amount;
      if (!Number.isSafeInteger(cents)) throw new Error("Table total is too large.");
    }
    totals[column] = (cents / 100).toFixed(2);
  }
  const labelColumn = block.headers.findIndex((_, column) => !block.totalColumns!.includes(column));
  if (labelColumn >= 0) totals[labelColumn] = "Total";
  return totals;
}

export function exampleDocumentName(filename: string) {
  return filename.replace(/\.(pdf|docx|xlsx)$/i, "").replace(/_/g, " ").trim().slice(0, 160) || "Accreditation document";
}

export function uniqueDocumentName(name: string, existing: Iterable<string>) {
  const names = new Set(Array.from(existing, item => item.toLocaleLowerCase()));
  const base = name.trim().slice(0, 160) || "Accreditation document";
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix++) {
    const ending = ` (${suffix})`;
    const candidate = base.slice(0, 160 - ending.length) + ending;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
}
