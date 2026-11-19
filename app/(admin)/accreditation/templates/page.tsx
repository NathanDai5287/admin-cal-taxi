import { requireAppAccess, hasAppAccess } from "@/lib/reimbursements/auth";
import { DeleteSavedForm } from "../delete-saved-form";
import { Button } from "@/components/brand/button";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { TEMPLATE_RESULT_MESSAGES } from "@/lib/accreditation/template-results";
import { startTemplateSubmission, uploadTemplate } from "../actions";
import { PdfTemplateViewer } from "./pdf-template-viewer";
import { TemplateUploadFields } from "./template-upload-fields";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  ...TEMPLATE_RESULT_MESSAGES,
  start_error: "A submission could not be started. Create an academic year first, then retry.",
};

function displayStatus(template: Record<string, unknown>) {
  if (template.analysis_status === "active" && template.is_active) return "Ready";
  if (template.analysis_status === "analyzing") return "Processing";
  if (template.analysis_status === "failed") return "Needs attention";
  return "Preparing";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ template?: string; family?: string; result?: string }> }) {
  const session = await requireAppAccess("accreditation");
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [familiesResult, templatesResult] = await Promise.all([
    supabase.from("accreditation_template_families").select("*").eq("workflow_mode", "legacy").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("accreditation_templates").select("*").order("created_at", { ascending: false }),
  ]);
  const families = familiesResult.data ?? [];
  const visibleFamilies = new Set(families.map((family: { id: string }) => family.id));
  const templates = (templatesResult.data ?? []).filter((template: { template_family_id: string }) => visibleFamilies.has(template.template_family_id));
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
        <h1 className="page-title">Legacy templates</h1>
        <a href="/accreditation/documents" className="inline-block my-3 font-bold text-brand underline">Create PDFs from previous examples</a>
        <p className="page-lede">Save each official form once. Generate a fresh draft using chapter guidance and prior submissions, adjust the details, and download the completed file.</p>
      </section>

      {typeof params.result === "string" && Object.hasOwn(RESULT_MESSAGES, params.result) ? <p className={`form-message ${["template_ready", "template_uploaded", "template_confirmed"].includes(params.result) ? "success" : ""}`} role="status">{RESULT_MESSAGES[params.result]}</p> : null}

      <section className="grid gap-5 lg:grid-cols-[330px_1fr]">
        <div className="card">
          <div className="card-header"><span className="card-title">Add a form</span></div>
          <form action={uploadTemplate} className="card-body border-t border-rule form-stack">
            <TemplateUploadFields />
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
            {hasAppAccess(session, "accreditation", "write") && <DeleteSavedForm id={String(selectedFamily.id)} name={String(selectedFamily.name)} />}
          </div> : <div className="card-body border-t border-rule text-sm text-muted">Save a blank form to start building your reusable library.</div>}
        </div>
      </section>
    </div>
  );
}
