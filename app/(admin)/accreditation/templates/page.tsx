import { Button } from "@/components/brand/button";
import { REPORT_DEFINITIONS } from "@/lib/accreditation/definitions";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { confirmTemplate, updateReportGuidance, uploadTemplate } from "../actions";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ template?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [result, definitionsResult] = await Promise.all([
    supabase.from("accreditation_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("accreditation_report_definitions").select("report_key, custom_guidance"),
  ]);
  const templates = result.data ?? [];
  const selected = templates.find((template: Record<string, unknown>) => template.id === params.template) ?? templates[0] ?? null;
  const selectedDefinition = selected ? REPORT_DEFINITIONS[selected.report_key as keyof typeof REPORT_DEFINITIONS] : null;
  const suggestedMapping = (selected?.mapping ?? {}) as Record<string, Record<string, unknown>>;
  const pdfFieldNames = Object.values(suggestedMapping).map((target) => target.fieldName).filter((value): value is string => typeof value === "string");
  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Official formats</p><h1 className="page-title">Template onboarding</h1><p className="page-lede">The original is preserved. Suggested field mappings must be confirmed before a template can generate reports.</p></section>
      {params.result ? <p className="form-message">{params.result.replaceAll("_", " ")}</p> : null}
      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card">
          <div className="card-header"><span className="card-title">Upload template</span></div>
          <form action={uploadTemplate} className="card-body border-t border-rule form-stack">
            <label className="field-label">Report<select className="field-input" name="reportKey">{Object.values(REPORT_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label>
            <label className="field-label">Official PDF, DOCX, or XLSX<input className="file-input mt-1" type="file" name="file" accept=".pdf,.docx,.xlsx" required /></label>
            <Button type="submit">Inspect template</Button>
          </form>
          <div className="border-t border-rule p-4 space-y-2">{templates.map((template: Record<string, unknown>) => <a key={String(template.id)} href={`/accreditation/templates?template=${template.id}`} className={`block rounded border p-3 text-sm ${selected?.id === template.id ? "border-brand bg-brand-light" : "border-rule"}`}><span className="font-bold">{String(template.original_name)}</span><span className="mt-1 block text-xs text-muted">{REPORT_DEFINITIONS[template.report_key as keyof typeof REPORT_DEFINITIONS]?.name} · v{String(template.version)} · {String(template.format).toUpperCase()}</span>{template.is_active ? <span className="badge badge-approved mt-2">Active</span> : null}</a>)}</div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Confirm mappings</span>{selected ? <span className="card-subtitle">{String(selected.original_name)}</span> : null}</div>
          {selected && selectedDefinition ? <form action={confirmTemplate} className="card-body border-t border-rule form-stack"><input type="hidden" name="templateId" value={String(selected.id)} /><p className="text-sm text-muted leading-relaxed">Tell the system where each report value belongs. Every required field must have a destination before activation.</p><div className="divide-y divide-rule rounded border border-rule">{selectedDefinition.fields.map((field) => { const suggestion = suggestedMapping[field.key] ?? {}; const prefix = `map_${field.key}`; return <div className="p-4" key={field.key}><div className="mb-3"><span className="text-sm font-bold">{field.label}</span>{field.required ? <span className="ml-2 text-xs font-bold text-warn">Required</span> : <span className="ml-2 text-xs text-muted">Optional</span>}</div>{selected.format === "docx" ? <label className="field-label">Placeholder name<input className="field-input" name={`${prefix}_placeholder`} defaultValue={String(suggestion.placeholder ?? field.key)} placeholder={field.key} /></label> : selected.format === "xlsx" ? <div className="grid grid-cols-[1fr_110px] gap-3"><label className="field-label">Worksheet<input className="field-input" name={`${prefix}_sheet`} defaultValue={String(suggestion.sheet ?? "")} placeholder="Budget" /></label><label className="field-label">Cell<input className="field-input" name={`${prefix}_cell`} defaultValue={String(suggestion.cell ?? "")} placeholder="B12" /></label></div> : <div className="space-y-3"><label className="field-label">Fillable PDF field<input className="field-input" name={`${prefix}_field`} list="pdf-field-names" defaultValue={String(suggestion.fieldName ?? "")} placeholder="Choose or type a field name" /></label><details><summary className="cursor-pointer text-xs font-bold text-brand">Use a page position instead</summary><div className="mt-3 grid grid-cols-3 gap-3"><label className="field-label">Page<input className="field-input" type="number" min="1" name={`${prefix}_page`} defaultValue={suggestion.page ? String(suggestion.page) : ""} /></label><label className="field-label">From left<input className="field-input" type="number" name={`${prefix}_x`} defaultValue={suggestion.x !== undefined ? String(suggestion.x) : ""} /></label><label className="field-label">From bottom<input className="field-input" type="number" name={`${prefix}_y`} defaultValue={suggestion.y !== undefined ? String(suggestion.y) : ""} /></label></div></details></div>}</div>; })}</div>{pdfFieldNames.length ? <datalist id="pdf-field-names">{pdfFieldNames.map((name) => <option key={name} value={name} />)}</datalist> : null}<div className="flex items-center gap-3"><Button type="submit">Confirm and activate</Button><a className="text-sm font-bold text-brand hover:underline" href={`/api/accreditation/templates/${selected.id}`}>Download original</a></div></form> : <div className="card-body border-t border-rule text-sm text-muted">Upload a template to inspect its fillable fields, named cells, or placeholders.</div>}
        </div>
      </section>
      <section className="card">
        <div className="card-header"><span className="card-title">Report requirements</span><span className="card-subtitle">Administrator guidance is subordinate to application safety rules and current official evidence.</span></div>
        <div className="grid gap-0 border-t border-rule md:grid-cols-3 md:divide-x md:divide-rule">
          {Object.values(REPORT_DEFINITIONS).map((definition) => {
            const stored = (definitionsResult.data ?? []).find((item: Record<string, unknown>) => item.report_key === definition.key);
            return <form action={updateReportGuidance} className="form-stack p-5" key={definition.key}><input type="hidden" name="reportKey" value={definition.key} /><div><h2 className="text-sm font-bold">{definition.name}</h2><p className="mt-1 text-xs text-muted">Required: {definition.fields.filter((field) => field.required).map((field) => field.label).join(", ")}</p></div><label className="field-label">Additional chapter guidance<textarea className="field-textarea min-h-32" name="guidance" defaultValue={String(stored?.custom_guidance ?? "")} placeholder="Optional terminology, priorities, or report-specific context." /></label><Button type="submit" variant="secondary">Save guidance</Button></form>;
          })}
        </div>
      </section>
    </div>
  );
}
