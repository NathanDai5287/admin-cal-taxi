import Link from "next/link";
import { notFound } from "next/navigation";

import { Button, ButtonLink } from "@/components/brand/button";
import type { DocumentYear } from "@/lib/accreditation/document-ui-types";
import { findChecklistAcademicYear, getChecklistReport, SUBMISSION_CHECKLIST_YEAR } from "@/lib/accreditation/submission-checklist";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { TEMPLATE_RESULT_MESSAGES } from "@/lib/accreditation/template-results";
import { hasAppAccess, requireAppAccess } from "@/lib/reimbursements/auth";
import { startTemplateSubmission, uploadTemplate } from "../../actions";
import { linkChecklistDocumentType } from "../../checklist-actions";
import { TemplateUploadFields } from "../../templates/template-upload-fields";

export const maxDuration = 180;

const messages: Record<string, string> = {
  ...TEMPLATE_RESULT_MESSAGES,
  saved_form_conflict: "A saved document type already uses this name. Link it below, or refresh if someone just uploaded a template.",
  form_linked: "Document type linked to this report.",
  link_error: "This document type could not be linked. Refresh and choose an available type.",
  example_document_linked: "This report uses an example-based document type. Open it to manage its examples.",
  start_error: "The draft could not be started. Check the academic year and template, then retry.",
};

type Family = { id: string; name: string; workflow_mode: "legacy" | "example_document"; checklist_report_key: string | null; archived_at: string | null };
type Template = { id: string; original_name: string; format: string; version: number; fields: unknown };
type Run = { id: string; title: string; term_id: string | null; status: string };

export default async function ChecklistReportPage({ params, searchParams }: {
  params: Promise<{ reportKey: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const session = await requireAppAccess("accreditation");
  const [{ reportKey }, { result }] = await Promise.all([params, searchParams]);
  const report = getChecklistReport(reportKey);
  if (!report) notFound();

  const canWrite = hasAppAccess(session, "accreditation", "write");
  const db = createAccreditationAdminClient();
  const [families, years] = await Promise.all([
    db.from("accreditation_template_families").select("id,name,workflow_mode,checklist_report_key,archived_at")
      .or(`checklist_report_key.eq.${report.key},and(checklist_report_key.is.null,archived_at.is.null)`).order("name"),
    db.from("academic_years").select("id,label,starts_on,ends_on,academic_terms(id,label,starts_on,ends_on)").order("starts_on", { ascending: false }),
  ]);
  if (families.error || years.error) throw new Error("The report setup could not be loaded.");

  const available = (families.data ?? []) as Family[];
  const linked = available.filter((item) => item.checklist_report_key === report.key);
  const family = linked.find((item) => !item.archived_at);
  const unlinked = available.filter((item) => item.checklist_report_key === null);
  const exampleBased = family?.workflow_mode === "example_document";
  const year = findChecklistAcademicYear((years.data ?? []) as DocumentYear[]);
  const terms = [...(year?.academic_terms ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  const [templateResult, runResult] = await Promise.all([
    family && !exampleBased ? db.from("accreditation_templates").select("id,original_name,format,version,fields:analysis->fields")
      .eq("template_family_id", family.id).eq("is_active", true).maybeSingle() : { data: null, error: null },
    year && linked.length ? db.from("accreditation_runs").select("id,title,term_id,status")
      .in("template_family_id", linked.map((item) => item.id)).eq("cycle_id", year.id).order("created_at", { ascending: false }) : { data: [], error: null },
  ]);
  if (templateResult.error || runResult.error) throw new Error("The report’s templates or submissions could not be loaded.");

  const template = templateResult.data as Template | null;
  const templateReady = Array.isArray(template?.fields);
  const runs = (runResult.data ?? []) as Run[];
  const documentPath = family ? `/accreditation/documents?family=${family.id}${year ? `&cycle=${year.id}` : ""}` : "/accreditation/documents";
  const success = result === "template_ready" || result === "form_linked";
  const message = typeof result === "string" && Object.hasOwn(messages, result) ? messages[result] : null;

  return (
    <div className="space-y-7">
      <header>
        <Link href="/accreditation#submission-checklist-title" className="text-sm font-semibold text-brand hover:underline">Back to submission checklist</Link>
        <h1 className="page-title mt-3">{report.title}</h1>
        <p className="page-lede">{SUBMISSION_CHECKLIST_YEAR.replace("-", "–")} Accreditation</p>
      </header>

      {message && <p className={`form-message ${success ? "success" : ""}`} role={success ? "status" : "alert"}>{message}</p>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="card" aria-labelledby="report-template-title">
          <div className="card-header"><h2 id="report-template-title" className="text-lg font-bold">Template</h2></div>
          <div className="card-body space-y-4 border-t border-rule pt-4">
            {template ? (
              <div>
                <p className="break-words font-semibold">{template.original_name}</p>
                <p className="mt-1 text-sm text-muted">{template.format.toUpperCase()} · Version {template.version}</p>
                <a href={`/api/accreditation/templates/${template.id}`} className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Download blank template</a>
                {!templateReady && <p className="mt-3 text-sm text-muted">Upload a new version to prepare this template for drafting.</p>}
              </div>
            ) : exampleBased ? (
              <div>
                <p className="font-semibold">{family?.name}</p>
                <p className="mt-1 text-sm text-muted">This document type uses previous examples to draft a new report.</p>
                <Link href={documentPath} className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Open document type</Link>
              </div>
            ) : <p className="text-sm text-muted">No template has been added.</p>}

            {canWrite && !exampleBased && (
              template ? <details className="border-t border-rule pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Upload a new version</summary>
                <form action={uploadTemplate} className="form-stack mt-3"><TemplateUploadFields checklistReportKey={report.key} /></form>
              </details> : <form action={uploadTemplate} className="form-stack"><TemplateUploadFields checklistReportKey={report.key} /></form>
            )}

            {canWrite && !family && unlinked.length > 0 && (
              <details className="border-t border-rule pt-3" open={result === "saved_form_conflict" || result === "link_error"}>
                <summary className="cursor-pointer text-sm font-semibold text-brand">Use a saved document type</summary>
                <form action={linkChecklistDocumentType} className="form-stack mt-3">
                  <input type="hidden" name="checklistReportKey" value={report.key} />
                  <label className="field-label">Document type<select name="templateFamilyId" className="field-input" required defaultValue=""><option value="" disabled>Choose a document type</option>{unlinked.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <Button type="submit" variant="secondary">Link document type</Button>
                </form>
              </details>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="report-submissions-title">
          <div className="card-header"><h2 id="report-submissions-title" className="text-lg font-bold">Submissions</h2></div>
          <div className="card-body space-y-4 border-t border-rule pt-4">
            {runs.length ? <ul className="divide-y divide-rule border-y border-rule">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link href={`/accreditation/reports/${run.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-3 text-sm hover:bg-canvas">
                    <span className="min-w-0 break-words font-semibold text-brand">{run.title}<span className="mt-1 block font-normal text-muted">{terms.find((term) => term.id === run.term_id)?.label ?? year?.label}</span></span>
                    <span className={`badge ${run.status === "approved" ? "badge-approved" : "badge-pending"}`}>{run.status.replaceAll("_", " ")}</span>
                  </Link>
                </li>
              ))}
            </ul> : <p className="text-sm text-muted">No submissions yet.</p>}

            {canWrite && (templateReady || exampleBased) && (year ? (
              exampleBased ? <ButtonLink href={documentPath}>Start or continue draft</ButtonLink> : (
                <form action={startTemplateSubmission} className="form-stack">
                  <input type="hidden" name="checklistReportKey" value={report.key} />
                  <input type="hidden" name="templateFamilyId" value={family?.id} />
                  {terms.length > 0 && <label className="field-label">Period<select name="termId" className="field-input"><option value="">Full academic year</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>}
                  <Button type="submit">Start or continue draft</Button>
                </form>
              )
            ) : <Link href="/accreditation#academic-year" className="text-sm font-semibold text-brand hover:underline">Set up the 2026–2027 academic year to start a draft</Link>)}
          </div>
        </section>
      </div>
    </div>
  );
}
