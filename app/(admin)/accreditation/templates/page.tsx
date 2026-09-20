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
  const analysis = (selected?.analysis ?? null) as { name?: string; description?: string; cadence?: string; fields?: Array<Record<string, unknown>>; warnings?: string[]; model?: string } | null;
  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Official formats</p><h1 className="page-title">AI template onboarding</h1><p className="page-lede">Upload a blank form and, optionally, a completed past submission. AI finds the fields and fill locations, then you approve a generated preview.</p></section>
      {params.result ? <p className="form-message">{params.result.replaceAll("_", " ")}</p> : null}
      <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card">
          <div className="card-header"><span className="card-title">Upload template</span></div>
          <form action={uploadTemplate} className="card-body border-t border-rule form-stack">
            <label className="field-label">Report<select className="field-input" name="reportKey">{Object.values(REPORT_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label>
            <label className="field-label">Blank PDF, DOCX, or XLSX<input className="file-input mt-1" type="file" name="file" accept=".pdf,.docx,.xlsx" required /></label>
            <label className="field-label">Optional completed past submission<input className="file-input mt-1" type="file" name="example" accept=".pdf,.docx,.xlsx" /><span className="field-hint">Used for field discovery and writing style. It is not treated as current-year proof.</span></label>
            <Button type="submit">Analyze with AI</Button>
          </form>
          <div className="border-t border-rule p-4 space-y-2">{templates.map((template: Record<string, unknown>) => <a key={String(template.id)} href={`/accreditation/templates?template=${template.id}`} className={`block rounded border p-3 text-sm ${selected?.id === template.id ? "border-brand bg-brand-light" : "border-rule"}`}><span className="font-bold">{String(template.original_name)}</span><span className="mt-1 block text-xs text-muted">{REPORT_DEFINITIONS[template.report_key as keyof typeof REPORT_DEFINITIONS]?.name} · v{String(template.version)} · {String(template.format).toUpperCase()}</span>{template.is_active ? <span className="badge badge-approved mt-2">Active</span> : template.analysis_status ? <span className="badge badge-pending mt-2">{String(template.analysis_status).replaceAll("_", " ")}</span> : null}</a>)}</div>
        </div>
        <div className="card">
            <div className="card-header"><span className="card-title">AI interpretation</span>{selected ? <span className="card-subtitle">{String(selected.original_name)}</span> : null}</div>
          {selected && selectedDefinition ? <div className="card-body border-t border-rule space-y-5"><div className="flex flex-wrap items-center gap-3"><span className={`badge ${selected.analysis_status === "active" ? "badge-approved" : "badge-pending"}`}>{String(selected.analysis_status ?? "needs review").replaceAll("_", " ")}</span>{analysis?.model ? <span className="text-xs text-muted">Model: {analysis.model}</span> : null}</div>{analysis ? <><div><h2 className="text-lg font-bold">{analysis.name ?? selectedDefinition.name}</h2><p className="mt-1 text-sm text-muted">{analysis.description ?? selectedDefinition.description}</p></div><div className="divide-y divide-rule rounded border border-rule">{(analysis.fields ?? []).map((field) => { const target = field.target as Record<string, unknown> | null; const location = target?.placeholder ? `tag: ${String(target.placeholder)}` : target?.paragraph ? `DOCX paragraph ${String(target.paragraph)}` : target?.sheet ? `${String(target.sheet)}!${String(target.cell)}` : target?.fieldName ? `PDF field: ${String(target.fieldName)}` : target?.page ? `PDF page ${String(target.page)} coordinate` : "No destination found"; return <div className="p-4" key={String(field.key)}><div className="flex items-start justify-between gap-3"><div><span className="text-sm font-bold">{String(field.label)}</span><p className="mt-1 text-xs text-muted">{String(field.description)}</p></div><span className={`badge ${Number(field.confidence) >= 0.8 ? "badge-approved" : "badge-pending"}`}>{Math.round(Number(field.confidence ?? 0) * 100)}%</span></div><p className={`mt-3 text-xs ${target ? "text-muted" : "text-warn"}`}>{location}</p></div>; })}</div>{analysis.warnings?.length ? <div className="rounded border border-warn bg-canvas p-3 text-sm text-warn">{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}<div className="flex flex-wrap items-center gap-3"><a className="rounded bg-brand px-4 py-2.5 text-sm font-bold text-white" href={`/api/accreditation/templates/${selected.id}?kind=preview`}>Download AI preview</a><a className="text-sm font-bold text-brand hover:underline" href={`/api/accreditation/templates/${selected.id}`}>Download original</a>{selected.analysis_status === "needs_review" ? <form action={confirmTemplate}><input type="hidden" name="templateId" value={String(selected.id)} /><Button type="submit">Approve and activate</Button></form> : null}</div></> : <p className="text-sm text-muted">Upload a template to start AI analysis.</p>}</div> : <div className="card-body border-t border-rule text-sm text-muted">Upload a blank template to begin.</div>}
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
