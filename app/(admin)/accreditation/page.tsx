import Link from "next/link";

import { Button } from "@/components/brand/button";
import { REPORT_DEFINITIONS } from "@/lib/accreditation/definitions";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import type { ReportKey } from "@/lib/accreditation/types";
import { createCycle, createRun } from "./actions";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  cycle_created: "Academic year created.",
  invalid_cycle: "Check the academic-year labels and dates.",
  cycle_error: "The academic year could not be created.",
  term_required: "Choose Fall or Spring for the contract.",
  report_error: "The report workspace could not be created.",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AccreditationDashboard({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; result?: string }>;
}) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [cyclesResult, templatesResult, sourcesResult, runsResult] = await Promise.all([
    supabase.from("accreditation_cycles").select("*, accreditation_terms(*)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_templates").select("report_key").eq("is_active", true),
    supabase.from("accreditation_sources").select("cycle_id, status"),
    supabase.from("accreditation_runs").select("id, report_key, cycle_id, term_id, title, status, created_at").order("created_at", { ascending: false }),
  ]);
  const cycles = cyclesResult.data ?? [];
  const selectedCycle = cycles.find((cycle: Record<string, unknown>) => cycle.id === params.cycle) ?? cycles[0] ?? null;
  const activeTemplates = new Set((templatesResult.data ?? []).map((template: Record<string, unknown>) => template.report_key));
  const readySources = (sourcesResult.data ?? []).filter((source: Record<string, unknown>) => source.cycle_id === selectedCycle?.id && source.status === "ready").length;
  const terms = ((selectedCycle?.accreditation_terms ?? []) as Array<Record<string, unknown>>).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  const cycleRuns = (runsResult.data ?? []).filter((run: Record<string, unknown>) => run.cycle_id === selectedCycle?.id);

  return (
    <div className="space-y-8">
      <section>
        <p className="page-eyebrow">Accreditation</p>
        <h1 className="page-title">Report workspace</h1>
        <p className="page-lede">Ground reports in chapter evidence, review every claim, and archive the approved official file.</p>
      </section>

      {params.result && RESULT_MESSAGES[params.result] ? <p className="form-message">{RESULT_MESSAGES[params.result]}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card">
          <div className="card-header"><span className="card-title">Academic year</span></div>
          <div className="card-body border-t border-rule">
            {cycles.length ? (
              <div className="flex flex-wrap gap-2">
                {cycles.map((cycle: Record<string, unknown>) => (
                  <Link key={String(cycle.id)} href={`/accreditation?cycle=${cycle.id}`} className={`rounded px-4 py-2 text-sm font-bold ${selectedCycle?.id === cycle.id ? "bg-brand text-white" : "bg-canvas text-muted hover:text-ink"}`}>
                    {String(cycle.label)}
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-muted">Create the first academic year to begin.</p>}
            {selectedCycle ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Evidence ready</p><p className="mt-1 text-2xl font-bold">{readySources}</p></div>
                <div className="rounded border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Templates active</p><p className="mt-1 text-2xl font-bold">{activeTemplates.size}/3</p></div>
                <div className="rounded border border-rule p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Approved</p><p className="mt-1 text-2xl font-bold">{cycleRuns.filter((run: Record<string, unknown>) => run.status === "approved").length}</p></div>
              </div>
            ) : null}
          </div>
        </div>

        <details className="card" open={!cycles.length}>
          <summary className="card-header cursor-pointer"><span className="card-title">Add academic year</span></summary>
          <form action={createCycle} className="card-body border-t border-rule form-stack">
            <label className="field-label">Label<input className="field-input" name="label" placeholder="2026–2027" required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">Fall starts<input className="field-input" type="date" name="fallStart" required /></label>
              <label className="field-label">Fall ends<input className="field-input" type="date" name="fallEnd" required /></label>
              <label className="field-label">Spring starts<input className="field-input" type="date" name="springStart" required /></label>
              <label className="field-label">Spring ends<input className="field-input" type="date" name="springEnd" required /></label>
            </div>
            <Button type="submit">Create year</Button>
          </form>
        </details>
      </section>

      {selectedCycle ? (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><p className="page-eyebrow">{String(selectedCycle.label)}</p><h2 className="text-xl font-bold">Pilot reports</h2></div>
            <div className="flex gap-3 text-sm"><Link className="font-bold text-brand hover:underline" href={`/accreditation/library?cycle=${selectedCycle.id}`}>Add evidence</Link><Link className="font-bold text-brand hover:underline" href="/accreditation/templates">Manage templates</Link></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(REPORT_DEFINITIONS) as ReportKey[]).map((key) => {
              const definition = REPORT_DEFINITIONS[key];
              const runs = cycleRuns.filter((run: Record<string, unknown>) => run.report_key === key);
              const openRun = runs.find((run: Record<string, unknown>) => run.status !== "approved");
              const approved = runs.filter((run: Record<string, unknown>) => run.status === "approved");
              return (
                <article className="card" key={key}>
                  <div className="card-header"><span className="card-title">{definition.name}</span><span className={`badge ${activeTemplates.has(key) ? "badge-approved" : "badge-pending"}`}>{activeTemplates.has(key) ? "Template ready" : "Needs template"}</span></div>
                  <div className="card-body border-t border-rule space-y-4">
                    <p className="text-sm text-muted leading-relaxed">{definition.description}</p>
                    {definition.cadence === "annual" ? (
                      openRun ? <Link className="block rounded bg-brand px-4 py-2.5 text-center text-sm font-bold text-white" href={`/accreditation/reports/${openRun.id}`}>Continue · {statusLabel(String(openRun.status))}</Link> : <form action={createRun}><input type="hidden" name="reportKey" value={key} /><input type="hidden" name="cycleId" value={String(selectedCycle.id)} /><Button type="submit" className="w-full">Start report</Button></form>
                    ) : (
                      <div className="space-y-2">{terms.map((term) => { const termRun = runs.find((run: Record<string, unknown>) => run.term_id === term.id && run.status !== "approved"); return termRun ? <Link key={String(term.id)} className="block rounded bg-brand px-4 py-2.5 text-center text-sm font-bold text-white" href={`/accreditation/reports/${termRun.id}`}>Continue {String(term.label)} · {statusLabel(String(termRun.status))}</Link> : <form action={createRun} key={String(term.id)}><input type="hidden" name="reportKey" value={key} /><input type="hidden" name="cycleId" value={String(selectedCycle.id)} /><input type="hidden" name="termId" value={String(term.id)} /><Button type="submit" variant="secondary" className="w-full">Start {String(term.label)}</Button></form>; })}</div>
                    )}
                    {approved.length ? <div className="border-t border-rule pt-3 text-xs text-muted">{approved.map((run: Record<string, unknown>) => <Link key={String(run.id)} href={`/accreditation/reports/${run.id}`} className="block py-1 font-bold text-brand hover:underline">Approved · {String(run.title)}</Link>)}</div> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
