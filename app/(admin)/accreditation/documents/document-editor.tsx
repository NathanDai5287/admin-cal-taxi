"use client";

import { Button } from "@/components/brand/button";
import { documentTableTotals, type AccreditationDocument } from "@/lib/accreditation/document";

type Block = AccreditationDocument["blocks"][number];
export function DocumentEditor({ document, disabled, onChange }: { document: AccreditationDocument; disabled: boolean; onChange: (document: AccreditationDocument) => void }) {
  const update = (id: string, block: Block) => onChange({ ...document, blocks: document.blocks.map(item => item.id === id ? block : item) });
  function add(type: Block["type"]) {
    const id = crypto.randomUUID();
    const block: Block = type === "heading" ? { id, type, level: 1, text: "New section" } : type === "paragraph" ? { id, type, text: "" } : type === "list" ? { id, type, ordered: false, items: [""] } : type === "table" ? { id, type, headers: ["Item", "Details"], rows: [["", ""]], totalColumns: [] } : type === "signature" ? { id, type, label: "Officer signature" } : { id, type };
    onChange({ ...document, blocks: [...document.blocks, block] });
  }
  return <div className="space-y-5">
    <label className="field-label">Document title<input className="field-input text-lg font-bold" value={document.title} maxLength={160} disabled={disabled} onChange={event => onChange({ ...document, title: event.target.value })} /></label>
    <label className="field-label">Reporting period<input className="field-input" value={document.period} maxLength={160} disabled={disabled} onChange={event => onChange({ ...document, period: event.target.value })} /></label>
    {document.blocks.map((block, index) => <section key={block.id} className="border-t border-rule pt-4 space-y-3" aria-label={`Document block ${index + 1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-muted">{block.type.replaceAll("_", " ")}</span>{!disabled && <div className="flex gap-2"><Button compact variant="text" disabled={!index} onClick={() => { const blocks = [...document.blocks]; [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; onChange({ ...document, blocks }); }}>Move up</Button><Button compact variant="text" disabled={document.blocks.length === 1} onClick={() => onChange({ ...document, blocks: document.blocks.filter(item => item.id !== block.id) })}>Remove</Button></div>}</div>
      {(block.type === "heading" || block.type === "paragraph") && <label className="field-label"><span className="sr-only">{block.type} text</span><textarea className={`field-textarea w-full ${block.type === "heading" ? "font-bold min-h-12" : "min-h-32"}`} maxLength={40000} value={block.text} disabled={disabled} onChange={event => update(block.id, { ...block, text: event.target.value })} /></label>}
      {block.type === "list" && <div className="space-y-2"><label className="check-row"><input type="checkbox" checked={block.ordered} disabled={disabled} onChange={event => update(block.id, { ...block, ordered: event.target.checked })} /><span>Numbered list</span></label>{block.items.map((item, itemIndex) => <label className="field-label" key={itemIndex}><span className="sr-only">List item {itemIndex + 1}</span><textarea className="field-textarea min-h-14" value={item} maxLength={40000} disabled={disabled} onChange={event => update(block.id, { ...block, items: block.items.map((value, i) => i === itemIndex ? event.target.value : value) })} /></label>)}{!disabled && <Button compact variant="secondary" disabled={block.items.length >= 200} onClick={() => update(block.id, { ...block, items: [...block.items, ""] })}>Add item</Button>}</div>}
      {block.type === "table" && <div className="space-y-3"><div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><thead><tr>{block.headers.map((header, column) => <th className="border border-rule p-2 min-w-36" key={column}><input className="field-input font-semibold" aria-label={`Column ${column + 1} heading`} value={header} disabled={disabled} onChange={event => update(block.id, { ...block, headers: block.headers.map((value, i) => i === column ? event.target.value : value) })} /></th>)}{!disabled && <th className="sr-only">Remove row</th>}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td className="border border-rule p-2 align-top" key={column}><textarea className="field-textarea min-h-16" aria-label={`Row ${rowIndex + 1}, ${block.headers[column]}`} value={cell} disabled={disabled} onChange={event => update(block.id, { ...block, rows: block.rows.map((value, i) => i === rowIndex ? value.map((text, j) => j === column ? event.target.value : text) : value) })} /></td>)}{!disabled && <td><Button compact variant="text" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => update(block.id, { ...block, rows: block.rows.filter((_, i) => i !== rowIndex) })}>Remove</Button></td>}</tr>)}</tbody></table></div>
        {!disabled && <div className="flex gap-2"><Button compact variant="secondary" disabled={block.rows.length >= 500} onClick={() => update(block.id, { ...block, rows: [...block.rows, block.headers.map(() => "")] })}>Add row</Button><Button compact variant="secondary" disabled={block.headers.length >= 12} onClick={() => update(block.id, { ...block, headers: [...block.headers, "Column"], rows: block.rows.map(row => [...row, ""]) })}>Add column</Button></div>}
        <fieldset className="space-y-2"><legend className="text-xs font-semibold text-muted">Calculate totals</legend>{block.headers.map((header, column) => <label key={column} className="inline-flex items-center gap-2 mr-4 text-xs"><input type="checkbox" disabled={disabled} checked={block.totalColumns?.includes(column) ?? false} onChange={event => update(block.id, { ...block, totalColumns: event.target.checked ? [...(block.totalColumns ?? []), column] : block.totalColumns?.filter(item => item !== column) })} />{header || `Column ${column + 1}`}</label>)}</fieldset><TableTotals block={block} />
      </div>}
      {block.type === "signature" && <label className="field-label">Signature label<input className="field-input" value={block.label} disabled={disabled} onChange={event => update(block.id, { ...block, label: event.target.value })} /></label>}
      {block.type === "page_break" && <p className="text-sm text-muted">Start a new page here.</p>}
    </section>)}
    {!disabled && <div className="border-t border-rule pt-4 flex flex-wrap gap-2">{(["heading", "paragraph", "list", "table", "signature", "page_break"] as const).map(type => <Button compact variant="secondary" key={type} disabled={document.blocks.length >= 500} onClick={() => add(type)}>Add {type.replaceAll("_", " ")}</Button>)}</div>}
  </div>;
}
function TableTotals({ block }: { block: Extract<Block, { type: "table" }> }) {
  let totals: string[] | null = null;
  let message = "";
  try { totals = documentTableTotals(block); }
  catch (error) { message = error instanceof Error ? error.message : "Check the numeric values."; }
  if (message) return <p className="text-sm text-warn">{message}</p>;
  return totals ? <p className="text-sm font-semibold">Totals: {totals.map((value, column) => value ? `${block.headers[column]} ${value}` : "").filter(Boolean).join(" · ")}</p> : null;
}
