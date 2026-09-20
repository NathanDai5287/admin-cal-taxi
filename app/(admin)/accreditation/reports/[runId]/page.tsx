import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/brand/button";
import { getReportDefinition } from "@/lib/accreditation/definitions";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import type { ReportDraft } from "@/lib/accreditation/types";
import { approveReport, createSuccessorRun, generateDraft } from "../../actions";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const RESULT_MESSAGES: Record<string, string> = {
  draft_ready: "Draft artifact generated and ready for officer review.",
  needs_input: "The draft was saved, but missing information or template problems must be resolved.",
  draft_error: "The draft could not be generated. Check the configured provider and source processing status.",
  review_required: "Download and inspect the official-format draft, then confirm the review checkbox.",
  approval_blocked: "Resolve validation errors before approval.",
  approval_error: "The approved archive could not be created.",
  approved: "Approved artifact archived successfully.",
};

export default async function ReportWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const supabase = createAccreditationAdminClient();
  const runResult = await supabase.from("accreditation_runs")
    .select("*, accreditation_cycles(label), accreditation_terms(label)")
    .eq("id", runId).maybeSingle();
  if (!runResult.data) notFound();
  const run = runResult.data;
  const definition = getReportDefinition(run.report_key);
  if (!definition) notFound();
  const revisionsResult = await supabase.from("accreditation_revisions").select("*").eq("run_id", runId).order("revision_number", { ascending: false });
  const revisions = revisionsResult.data ?? [];
  const latest = revisions[0] ?? null;
  const [artifactsResult, citationsResult] = await Promise.all([
    revisions.length ? supabase.from("accreditation_artifacts").select("*").in("revision_id", revisions.map((revision: Record<string, unknown>) => revision.id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    latest ? supabase.from("accreditation_citations").select("*, accreditation_sources(original_name)").eq("revision_id", latest.id).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const latestTemplate = latest?.template_id ? await supabase.from("accreditation_templates").select("analysis").eq("id", latest.template_id).maybeSingle() : { data: null };
  const artifacts = artifactsResult.data ?? [];
  const latestArtifacts = artifacts.filter((artifact: Record<string, unknown>) => artifact.revision_id === latest?.id);
  const draftArtifact = latestArtifacts.find((artifact: Record<string, unknown>) => artifact.kind === "draft");
  const approvedArtifact = artifacts.find((artifact: Record<string, unknown>) => artifact.kind === "approved" && artifact.revision_id === run.approved_revision_id);
  const citations = citationsResult.data ?? [];
  const draft = latest?.draft as ReportDraft | undefined;
  const validation = (latest?.validation ?? []) as Array<{ level: "error" | "warning"; field?: string; message: string }>;
  const analyzedFields = (latestTemplate.data?.analysis as { fields?: Array<Record<string, unknown>> } | null)?.fields;
  const displayFields = analyzedFields?.length ? analyzedFields.map((field) => ({
    key: String(field.key), label: String(field.label ?? field.key), description: String(field.description ?? ""), required: Boolean(field.required), multiline: Boolean(field.multiline),
  })) : definition.fields;
  const missing = displayFields.filter((field) => field.required && !draft?.fields[field.key]?.value);
  const cycleRelation = Array.isArray(run.accreditation_cycles) ? run.accreditation_cycles[0] : run.accreditation_cycles;
  const termRelation = Array.isArray(run.accreditation_terms) ? run.accreditation_terms[0] : run.accreditation_terms;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <section>
          <Link href={`/accreditation?cycle=${run.cycle_id}`} className="text-sm font-bold text-brand hover:underline">← Accreditation dashboard</Link>
          <p className="page-eyebrow mt-5">{String(cycleRelation?.label ?? "Academic year")}{termRelation?.label ? ` · ${termRelation.label}` : ""}</p>
          <h1 className="page-title">{definition.name}</h1>
          <p className="page-lede">{definition.description}</p>
        </section>
        <span className={`badge mt-8 ${run.status === "approved" || run.status === "ready_for_review" ? "badge-approved" : "badge-pending"}`}>{label(String(run.status))}</span>
      </div>

      {query.result && RESULT_MESSAGES[query.result] ? <p className={`form-message ${query.result === "approved" || query.result === "draft_ready" ? "success" : ""}`}>{RESULT_MESSAGES[query.result]}</p> : null}

      {run.status === "approved" ? (
        <section className="card">
          <div className="card-header"><span className="card-title">Approved archive</span><span className="badge badge-approved">Immutable</span></div>
          <div className="card-body border-t border-rule flex flex-wrap items-center justify-between gap-4">
            <div><p className="font-bold">{approvedArtifact ? String(approvedArtifact.filename) : "Approved artifact"}</p><p className="mt-1 text-sm text-muted">Approved {new Date(run.approved_at).toLocaleString()}</p></div>
            <div className="flex gap-3">{approvedArtifact ? <a className="rounded bg-brand px-4 py-2 text-sm font-bold text-white" href={`/api/accreditation/artifacts/${approvedArtifact.id}`}>Download approved file</a> : null}<form action={createSuccessorRun}><input type="hidden" name="runId" value={runId} /><Button type="submit" variant="secondary">Create new version</Button></form></div>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-header"><span className="card-title">Draft with instructions</span><span className="card-subtitle">Use one “field = value” override per line for exact officer-supplied facts.</span></div>
          <form action={generateDraft} className="card-body border-t border-rule form-stack">
            <input type="hidden" name="runId" value={runId} />
            <label className="field-label">What should this version include?<textarea className="field-textarea min-h-32" name="instruction" defaultValue={latest?.user_instruction ?? ""} placeholder={'Draft from the current evidence.\nbig_brother_name = Alex Example\neffective_date = 2026-09-16'} /></label>
            <div className="flex items-center gap-3"><Button type="submit">Generate new draft revision</Button><span className="text-xs text-muted">This never approves or submits the report.</span></div>
          </form>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="card">
          <div className="card-header"><span className="card-title">{latest ? `Draft revision ${latest.revision_number}` : "Draft fields"}</span>{latest ? <span className="card-subtitle">{new Date(latest.created_at).toLocaleString()}</span> : null}</div>
          <div className="divide-y divide-rule border-t border-rule">
            {displayFields.map((field) => {
              const value = draft?.fields[field.key];
              const fieldCitations = citations.filter((citation: Record<string, unknown>) => citation.field_key === field.key);
              return <article key={field.key} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold">{field.label}</h2><p className="mt-1 text-xs text-muted">{field.description}</p></div>{value ? <span className={`badge ${value.officerOverride ? "badge-verified" : value.value ? "badge-approved" : "badge-pending"}`}>{value.officerOverride ? "Officer input" : `${Math.round(value.confidence * 100)}%`}</span> : null}</div>{value?.value ? <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink">{value.value}</div> : <p className="mt-4 rounded bg-canvas p-3 text-sm text-muted">{value?.missingReason ?? "Not drafted yet."}</p>}{fieldCitations.length ? <div className="mt-4 space-y-2">{fieldCitations.map((citation: Record<string, unknown>) => { const relation = citation.accreditation_sources; const source = (Array.isArray(relation) ? relation[0] : relation) as Record<string, unknown> | null; const excerpt = typeof citation.excerpt === "string" && citation.excerpt ? citation.excerpt : JSON.stringify(citation.app_record, null, 2); return <details key={String(citation.id)} className="rounded border border-rule p-3 text-xs"><summary className="cursor-pointer font-bold text-brand">{citation.provenance === "user_input" ? "Officer instruction" : citation.provenance === "app_snapshot" ? "Frozen app record" : String(source?.original_name ?? "Evidence source")}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-muted">{excerpt}</pre></details>; })}</div> : null}</article>;
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="card"><div className="card-header"><span className="card-title">Completion check</span></div><div className="card-body border-t border-rule space-y-3">{missing.length ? <ul className="space-y-2 text-sm text-warn">{missing.map((field) => <li key={field.key}>• {field.label} is missing</li>)}</ul> : <p className="text-sm text-ok">All required fields have values.</p>}{validation.length ? <ul className="space-y-2 border-t border-rule pt-3 text-sm">{validation.map((item, index) => <li key={`${item.field}-${index}`} className={item.level === "error" ? "text-warn" : "text-muted"}>• {item.message}</li>)}</ul> : latest ? <p className="border-t border-rule pt-3 text-sm text-ok">No validation errors.</p> : null}</div></section>
          {latest ? <section className="card"><div className="card-header"><span className="card-title">Official file</span></div><div className="card-body border-t border-rule space-y-4">{draftArtifact ? <a className="block rounded bg-brand px-4 py-2.5 text-center text-sm font-bold text-white" href={`/api/accreditation/artifacts/${draftArtifact.id}`}>Download draft · {String(draftArtifact.filename).split(".").pop()?.toUpperCase()}</a> : <p className="text-sm text-muted">No artifact is available. Confirm the template mapping and generate another revision.</p>}{run.status === "ready_for_review" && draftArtifact ? <form action={approveReport} className="space-y-3"><input type="hidden" name="runId" value={runId} /><input type="hidden" name="revisionId" value={String(latest.id)} /><label className="check-row"><input type="checkbox" name="reviewed" required /><span>I downloaded and reviewed the official-format file.</span></label><Button type="submit" className="w-full">Approve and archive</Button></form> : null}</div></section> : null}
          {revisions.length > 1 ? <section className="card"><div className="card-header"><span className="card-title">Revision history</span></div><div className="card-body border-t border-rule space-y-2">{revisions.map((revision: Record<string, unknown>) => <div key={String(revision.id)} className="flex justify-between text-xs"><span className="font-bold">Revision {String(revision.revision_number)}</span><span className="text-muted">{new Date(String(revision.created_at)).toLocaleString()}</span></div>)}</div></section> : null}
        </aside>
      </div>
    </div>
  );
}
