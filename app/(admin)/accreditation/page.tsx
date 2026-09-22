import Link from "next/link";

import { Button } from "@/components/brand/button";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import type { TemplateFamily } from "@/lib/accreditation/types";
import { createCycle, startTemplateSubmission } from "./actions";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  cycle_created: "Academic year created.",
  invalid_cycle: "Check the academic-year labels and dates.",
  cycle_error: "The academic year could not be created.",
  start_error: "The submission could not be started. Check that an academic year and ready template exist.",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AccreditationDashboard({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [cyclesResult, familiesResult, templatesResult, sourcesResult, runsResult] = await Promise.all([
    supabase.from("academic_years").select("*, academic_terms(*)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_template_families").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("accreditation_templates").select("template_family_id, format, is_active, analysis_status"),
    supabase.from("accreditation_sources").select("cycle_id, status"),
    supabase.from("accreditation_runs").select("id, template_family_id, cycle_id, term_id, title, status, created_at").order("created_at", { ascending: false }),
  ]);
  const cycles = cyclesResult.data ?? [];
  const families = (familiesResult.data ?? []) as TemplateFamily[];
  const selectedCycle = cycles.find((cycle: Record<string, unknown>) => cycle.id === params.cycle) ?? cycles[0] ?? null;
  const activeTemplates = (templatesResult.data ?? []).filter((template: Record<string, unknown>) => template.is_active);
  const activeByFamily = new Map<string, Record<string, unknown>>(activeTemplates.map((template: Record<string, unknown>) => [String(template.template_family_id), template]));
  const readySources = (sourcesResult.data ?? []).filter((source: Record<string, unknown>) => source.cycle_id === selectedCycle?.id && source.status === "ready").length;
  const terms: Array<Record<string, unknown>> = ((selectedCycle?.academic_terms ?? []) as Array<Record<string, unknown>>).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  const cycleRuns = (runsResult.data ?? []).filter((run: Record<string, unknown>) => run.cycle_id === selectedCycle?.id);

  return (
    <div className="space-y-8">
      <section><p className="page-eyebrow">Accreditation</p><h1 className="page-title">Submission workspace</h1><p className="page-lede">Save official forms once, complete them through conversation, and archive the reviewed submissions.</p></section>
      {params.result && RESULT_MESSAGES[params.result] ? <p className="form-message" role="status">{RESULT_MESSAGES[params.result]}</p> : null}
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card"><div className="card-header"><span className="card-title">Academic year</span></div><div className="card-body border-t border-rule">
          {cycles.length ? <div className="flex flex-wrap gap-2">{cycles.map((cycle: Record<string, unknown>) => <Link key={String(cycle.id)} href={`/accreditation?cycle=${cycle.id}`} className={`px-4 py-2 text-sm font-bold ${selectedCycle?.id === cycle.id ? "bg-brand text-white" : "bg-canvas text-muted hover:text-ink"}`}>{String(cycle.label)}</Link>)}</div> : <p className="text-sm text-muted">Create the first academic year to begin.</p>}
          {selectedCycle ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Evidence ready</p><p className="mt-1 text-2xl font-bold">{readySources}</p></div><div className="border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Forms ready</p><p className="mt-1 text-2xl font-bold">{activeTemplates.length}</p></div><div className="border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Approved</p><p className="mt-1 text-2xl font-bold">{cycleRuns.filter((run: Record<string, unknown>) => run.status === "approved").length}</p></div></div> : null}
        </div></div>
        <details className="card" open={!cycles.length}><summary className="card-header cursor-pointer"><span className="card-title">Add academic year</span></summary><form action={createCycle} className="card-body border-t border-rule form-stack"><label className="field-label">Label<input className="field-input" name="label" placeholder="2026–2027" required /></label><div className="grid grid-cols-2 gap-3"><label className="field-label">Fall starts<input className="field-input" type="date" name="fallStart" required /></label><label className="field-label">Fall ends<input className="field-input" type="date" name="fallEnd" required /></label><label className="field-label">Spring starts<input className="field-input" type="date" name="springStart" required /></label><label className="field-label">Spring ends<input className="field-input" type="date" name="springEnd" required /></label></div><Button type="submit">Create year</Button></form></details>
      </section>
      {selectedCycle ? <section><div className="mb-4 flex items-end justify-between gap-4"><div><p className="page-eyebrow">{String(selectedCycle.label)}</p><h2 className="text-xl font-bold">Saved forms</h2></div><div className="flex gap-3 text-sm"><Link className="font-bold text-brand hover:underline" href={`/accreditation/library?cycle=${selectedCycle.id}`}>Add evidence</Link><Link className="font-bold text-brand hover:underline" href="/accreditation/templates">Manage templates</Link></div></div>
        {families.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{families.map((family) => { const template = activeByFamily.get(family.id); const runs = cycleRuns.filter((run: Record<string, unknown>) => run.template_family_id === family.id); const openRun = runs.find((run: Record<string, unknown>) => run.status !== "approved"); const approved = runs.filter((run: Record<string, unknown>) => run.status === "approved"); return <article className="card" key={family.id}><div className="card-header"><span className="card-title">{family.name}</span><span className={`badge ${template ? "badge-approved" : "badge-pending"}`}>{template ? "Ready" : "Needs setup"}</span></div><div className="card-body border-t border-rule space-y-4"><p className="text-sm leading-relaxed text-muted">{family.description || "Complete this form through a short conversation."}</p>{template ? <>{openRun ? <Link className="block bg-brand px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-white" href={`/accreditation/reports/${openRun.id}`}>Continue · {statusLabel(String(openRun.status))}</Link> : terms.length ? <div className="space-y-2">{terms.map((term) => <form action={startTemplateSubmission} key={String(term.id)}><input type="hidden" name="templateFamilyId" value={family.id} /><input type="hidden" name="termId" value={String(term.id)} /><Button type="submit" className="w-full">Start {String(term.label)}</Button></form>)}</div> : <form action={startTemplateSubmission}><input type="hidden" name="templateFamilyId" value={family.id} /><Button type="submit" className="w-full">Start submission</Button></form>}</> : <Link className="text-sm font-bold text-brand hover:underline" href={`/accreditation/templates?family=${family.id}`}>Prepare this form</Link>}{approved.length ? <div className="border-t border-rule pt-3 text-xs text-muted">{approved.map((run: Record<string, unknown>) => <Link key={String(run.id)} href={`/accreditation/reports/${run.id}`} className="block py-1 font-bold text-brand hover:underline">Approved · {String(run.title)}</Link>)}</div> : null}</div></article>; })}</div> : <div className="border-y border-rule py-8 text-sm text-muted">No forms saved yet. Add one from Template library.</div>}
      </section> : null}
    </div>
  );
}
