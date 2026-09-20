import { Button } from "@/components/brand/button";
import { REPORT_DEFINITIONS } from "@/lib/accreditation/definitions";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { confirmTemplate, updateReportGuidance, uploadTemplate } from "../actions";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  invalid: "Choose a report type and template file, then try again.",
  invalid_file: "The template could not be opened. Use a valid, unencrypted PDF, DOCX, or XLSX file up to 25 MB.",
  invalid_example: "The past submission could not be opened. Use a valid PDF, DOCX, or XLSX file up to 25 MB.",
  example_format_mismatch: "The blank template and past submission must use the same file format.",
  template_ai_not_configured: "Template analysis is not configured. Add the accreditation AI credentials before retrying.",
  template_ocr_not_configured: "PDF analysis needs the configured OCR provider. Add the OCR credentials before retrying.",
  template_ai_temporarily_unavailable: "The AI provider is temporarily busy or rate-limited. Wait a moment and retry this template.",
  template_ai_response_invalid: "The AI returned an incomplete template analysis. Retry the document; if it repeats, add explicit [[FIELD NAME]] tags.",
  template_pdf_invalid_or_encrypted: "This PDF is invalid or encrypted. Export an unencrypted copy and try again.",
  template_too_complex: "This document exceeds the template processing limits. Reduce its page count or file complexity and retry.",
  template_analysis_failed: "The document was accepted, but its fields could not be analyzed. Retry with a fresh export or add explicit [[FIELD NAME]] tags.",
  template_storage_not_configured: "Template storage is not configured on the server. Create or repair the accreditation-templates bucket.",
  template_storage_permission_denied: "The server could not write to private template storage. Check the storage policy and service credentials.",
  template_file_too_large: "The storage service rejected this file as too large. Templates and examples must each be 25 MB or smaller.",
  template_storage_failed: "The original file could not be saved to template storage. Retry the upload or check the storage service.",
  template_example_storage_failed: "The template was accepted, but the past submission could not be saved. Retry or upload the template without the example.",
  template_preview_render_failed: "AI analysis finished, but the sample file could not be rendered. Check the inferred field locations and retry.",
  template_preview_storage_failed: "The sample file was generated, but it could not be saved to template storage.",
  template_database_update_required: "The AI template database update has not been applied yet. Apply the pending Supabase migration, then retry.",
  template_database_permission_denied: "The server could not save the template record. Check database permissions for accreditation templates.",
  template_version_conflict: "Another template version was created at the same time. Refresh the page and upload again.",
  template_record_failed: "The files were processed, but the template record could not be saved. Check the database log and retry.",
  template_uploaded: "Template analyzed successfully. Review the AI preview before activation.",
  template_confirmed: "Template approved and activated.",
  analysis_incomplete: "AI could not find a destination for every required field. Add explicit [[FIELD NAME]] tags and upload a new version.",
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ template?: string; result?: string; view?: string }> }) {
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
  const selectedIsPdf = selected?.format === "pdf";
  const previewAvailable = Boolean(selected?.preview_storage_path);
  const viewerKind = selectedIsPdf && params.view === "original" ? "original" : selectedIsPdf && previewAvailable ? "preview" : "original";
  const viewerAvailable = selectedIsPdf && (viewerKind === "preview" ? previewAvailable : Boolean(selected?.storage_path));
  const viewerUrl = selected && viewerAvailable ? `/api/accreditation/templates/${selected.id}?${viewerKind === "preview" ? "kind=preview&" : ""}inline=1#toolbar=1&navpanes=0` : null;
  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Official formats</p><h1 className="page-title">AI template onboarding</h1><p className="page-lede">Upload a blank form and, optionally, a completed past submission. AI finds the fields and fill locations, then you approve a generated preview.</p></section>
      {params.result ? <p className={`form-message ${params.result === "template_uploaded" || params.result === "template_confirmed" ? "success" : ""}`} role="status">{RESULT_MESSAGES[params.result] ?? params.result.replaceAll("_", " ")}</p> : null}
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
          {selected && selectedDefinition ? <div className="card-body border-t border-rule space-y-5"><div className="flex flex-wrap items-center gap-3"><span className={`badge ${selected.analysis_status === "active" ? "badge-approved" : "badge-pending"}`}>{String(selected.analysis_status ?? "needs review").replaceAll("_", " ")}</span>{analysis?.model ? <span className="text-xs text-muted">Model: {analysis.model}</span> : null}</div>{selectedIsPdf ? <section className="rounded border border-rule overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-canvas p-3"><div><p className="text-sm font-bold">PDF viewer</p><p className="text-xs text-muted">Review the source and AI-filled preview before activation.</p></div><div className="flex gap-2 text-xs font-bold"><a className={`rounded px-3 py-2 ${viewerKind === "original" ? "bg-brand text-white" : "bg-white text-brand"}`} href={`/accreditation/templates?template=${selected.id}&view=original`}>Original</a>{previewAvailable ? <a className={`rounded px-3 py-2 ${viewerKind === "preview" ? "bg-brand text-white" : "bg-white text-brand"}`} href={`/accreditation/templates?template=${selected.id}&view=preview`}>AI preview</a> : null}</div></div>{viewerUrl ? <iframe className="block h-[680px] w-full bg-white" src={viewerUrl} title={`${viewerKind === "preview" ? "AI preview" : "Original"} PDF template`} /> : <p className="p-5 text-sm text-muted">The PDF is not available for inline viewing.</p>}</section> : <p className="rounded border border-rule bg-canvas p-4 text-sm text-muted">Inline viewing is available for PDF templates. Download the {String(selected.format).toUpperCase()} file to inspect it.</p>}{analysis ? <><div><h2 className="text-lg font-bold">{analysis.name ?? selectedDefinition.name}</h2><p className="mt-1 text-sm text-muted">{analysis.description ?? selectedDefinition.description}</p></div><div className="divide-y divide-rule rounded border border-rule">{(analysis.fields ?? []).map((field) => { const target = field.target as Record<string, unknown> | null; const location = target?.placeholder ? `tag: ${String(target.placeholder)}` : target?.paragraph ? `DOCX paragraph ${String(target.paragraph)}` : target?.sheet ? `${String(target.sheet)}!${String(target.cell)}` : target?.fieldName ? `PDF field: ${String(target.fieldName)}` : target?.page ? `PDF page ${String(target.page)} coordinate` : "No destination found"; return <div className="p-4" key={String(field.key)}><div className="flex items-start justify-between gap-3"><div><span className="text-sm font-bold">{String(field.label)}</span><p className="mt-1 text-xs text-muted">{String(field.description)}</p></div><span className={`badge ${Number(field.confidence) >= 0.8 ? "badge-approved" : "badge-pending"}`}>{Math.round(Number(field.confidence ?? 0) * 100)}%</span></div><p className={`mt-3 text-xs ${target ? "text-muted" : "text-warn"}`}>{location}</p></div>; })}</div>{analysis.warnings?.length ? <div className="rounded border border-warn bg-canvas p-3 text-sm text-warn">{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}<div className="flex flex-wrap items-center gap-3"><a className="rounded bg-brand px-4 py-2.5 text-sm font-bold text-white" href={`/api/accreditation/templates/${selected.id}?kind=preview`}>Download AI preview</a><a className="text-sm font-bold text-brand hover:underline" href={`/api/accreditation/templates/${selected.id}`}>Download original</a>{selected.analysis_status === "needs_review" ? <form action={confirmTemplate}><input type="hidden" name="templateId" value={String(selected.id)} /><Button type="submit">Approve and activate</Button></form> : null}</div></> : <p className="text-sm text-muted">Upload a template to start AI analysis.</p>}</div> : <div className="card-body border-t border-rule text-sm text-muted">Upload a blank template to begin.</div>}
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
