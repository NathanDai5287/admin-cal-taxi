import { Button } from "@/components/brand/button";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { startTemplateSubmission, uploadTemplate } from "../actions";
import { PdfTemplateViewer } from "./pdf-template-viewer";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  invalid: "Give the form a name and choose a supported template file.",
  invalid_file: "The template could not be opened. Use a valid, unencrypted PDF, DOCX, or XLSX file up to 25 MB.",
  invalid_example: "The example could not be opened. Use a valid PDF, DOCX, or XLSX file up to 25 MB.",
  example_format_mismatch: "The blank template and example must use the same file format.",
  template_ai_not_configured: "Template analysis is not configured. Add the accreditation AI credentials before retrying.",
  template_ai_temporarily_unavailable: "The AI provider is temporarily busy. Wait a moment and retry.",
  template_analysis_failed: "The form was not ready for use. Upload a fresh export or retry the analysis.",
  template_storage_failed: "The original form could not be saved. Retry the upload.",
  template_ready: "Template ready. Start a submission whenever you are ready.",
  template_uploaded: "Template ready. Start a submission whenever you are ready.",
  template_confirmed: "Template ready. Start a submission whenever you are ready.",
  start_error: "A submission could not be started. Create an academic year first, then retry.",
};

function displayStatus(template: Record<string, unknown>) {
  if (template.analysis_status === "active" && template.is_active) return "Ready";
  if (template.analysis_status === "analyzing") return "Processing";
  if (template.analysis_status === "failed") return "Needs attention";
  return "Preparing";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ template?: string; family?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [familiesResult, templatesResult] = await Promise.all([
    supabase.from("accreditation_template_families").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("accreditation_templates").select("*").order("created_at", { ascending: false }),
  ]);
  const families = familiesResult.data ?? [];
  const templates = templatesResult.data ?? [];
  const selectedTemplate = templates.find((template: Record<string, unknown>) => template.id === params.template) ?? templates.find((template: Record<string, unknown>) => params.family && template.template_family_id === params.family && template.is_active) ?? templates.find((template: Record<string, unknown>) => template.is_active) ?? templates[0] ?? null;
  const selectedFamily = selectedTemplate ? families.find((family: Record<string, unknown>) => family.id === selectedTemplate.template_family_id) : null;
  const familyTemplates = new Map<string, Record<string, unknown>>();
  for (const template of templates as Array<Record<string, unknown>>) {
    const familyId = String(template.template_family_id ?? "");
    if (!familyTemplates.has(familyId) || template.is_active) familyTemplates.set(familyId, template);
  }
  const selectedAnalysis = (selectedTemplate?.analysis ?? null) as { description?: string; warnings?: string[] } | null;

  return (
    <div className="space-y-7">
      <section>
        <p className="page-eyebrow">Accreditation forms</p>
        <h1 className="page-title">Template library</h1>
        <p className="page-lede">Save each official form once. When you need a submission, tell the assistant what belongs in it and download the completed file.</p>
      </section>

      {params.result && RESULT_MESSAGES[params.result] ? <p className={`form-message ${["template_ready", "template_uploaded", "template_confirmed"].includes(params.result) ? "success" : ""}`} role="status">{RESULT_MESSAGES[params.result]}</p> : null}

      <section className="grid gap-5 lg:grid-cols-[330px_1fr]">
        <div className="card">
          <div className="card-header"><span className="card-title">Add a form</span></div>
          <form action={uploadTemplate} className="card-body border-t border-rule form-stack">
            <label className="field-label">Template name<input className="field-input" name="templateName" placeholder="Big Brother Contract" required /></label>
            <label className="field-label">Blank PDF, DOCX, or XLSX<input className="file-input mt-1" type="file" name="file" accept=".pdf,.docx,.xlsx" required /></label>
            <details className="border-t border-rule pt-3">
              <summary className="cursor-pointer text-sm font-bold text-brand">Optional guidance</summary>
              <div className="mt-3 form-stack">
                <label className="field-label">What should the assistant know?<textarea className="field-textarea min-h-24" name="guidance" placeholder="Terminology, ordinary defaults, or how this form is used." /></label>
                <label className="field-label">Completed example<input className="file-input mt-1" type="file" name="example" accept=".pdf,.docx,.xlsx" /><span className="field-hint">Used as style context only. It is never treated as current proof.</span></label>
              </div>
            </details>
            <Button type="submit">Save template</Button>
          </form>
          <div className="border-t border-rule p-4 space-y-2">
            {families.length ? families.map((family: Record<string, unknown>) => {
              const template = familyTemplates.get(String(family.id));
              return <a key={String(family.id)} href={`/accreditation/templates?template=${template?.id ?? ""}`} className={`block border p-3 text-sm ${selectedFamily?.id === family.id ? "border-brand bg-brand-light" : "border-rule"}`}><span className="font-bold">{String(family.name)}</span><span className="mt-1 block text-xs text-muted">{template ? `${String(template.format).toUpperCase()} · v${String(template.version)}` : "No uploaded version"}</span><span className={`badge mt-2 ${template?.is_active ? "badge-approved" : "badge-pending"}`}>{template ? displayStatus(template) : "Needs upload"}</span></a>;
            }) : <p className="text-sm text-muted">Your saved forms will appear here.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">{selectedFamily ? String(selectedFamily.name) : "Choose a template"}</span>{selectedTemplate ? <span className={`badge ${selectedTemplate.is_active ? "badge-approved" : "badge-pending"}`}>{displayStatus(selectedTemplate)}</span> : null}</div>
          {selectedTemplate && selectedFamily ? <div className="card-body border-t border-rule space-y-5">
            {selectedTemplate.format === "pdf" ? <PdfTemplateViewer key={String(selectedTemplate.id)} previewAvailable={Boolean(selectedTemplate.preview_storage_path)} templateId={String(selectedTemplate.id)} /> : <div className="rounded border border-rule bg-canvas p-4 text-sm text-muted">This {String(selectedTemplate.format).toUpperCase()} form is ready to use. The completed download will keep the same format.</div>}
            <div><p className="text-sm leading-relaxed text-muted">{selectedAnalysis?.description ?? String(selectedFamily.description ?? "The assistant will learn the writable parts of this form when you start a submission.")}</p>{selectedAnalysis?.warnings?.length ? <p className="mt-3 text-xs text-muted">The assistant will handle the form’s remaining details during the conversation.</p> : null}</div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedTemplate.is_active ? <form action={startTemplateSubmission}><input type="hidden" name="templateFamilyId" value={String(selectedFamily.id)} /><Button type="submit">Start submission</Button></form> : <p className="text-sm text-warn">This form is still being prepared.</p>}
              <a className="text-sm font-bold text-brand hover:underline" href={`/api/accreditation/templates/${selectedTemplate.id}`}>Download original</a>
            </div>
          </div> : <div className="card-body border-t border-rule text-sm text-muted">Save a blank form to start building your reusable library.</div>}
        </div>
      </section>
    </div>
  );
}
