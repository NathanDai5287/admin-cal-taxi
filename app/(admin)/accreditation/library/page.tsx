import Link from "next/link";

import { Button } from "@/components/brand/button";
import { REPORT_DEFINITIONS } from "@/lib/accreditation/definitions";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { archiveSource, uploadSource } from "../actions";

export const dynamic = "force-dynamic";

export default async function EvidenceLibrary({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [cyclesResult, sourcesResult] = await Promise.all([
    supabase.from("accreditation_cycles").select("*, accreditation_terms(*)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_sources").select("*").order("created_at", { ascending: false }),
  ]);
  const cycles = cyclesResult.data ?? [];
  const cycle = cycles.find((item: Record<string, unknown>) => item.id === params.cycle) ?? cycles[0] ?? null;
  const terms = (cycle?.accreditation_terms ?? []) as Array<Record<string, unknown>>;
  const sources = (sourcesResult.data ?? []).filter((source: Record<string, unknown>) => source.cycle_id === cycle?.id);
  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Evidence library</p><h1 className="page-title">Sources and proof</h1><p className="page-lede">Uploaded content is treated as untrusted evidence, never as instructions to the system.</p></section>
      {params.result ? <p className="form-message">{params.result.replaceAll("_", " ")}</p> : null}
      {cycles.length ? <nav className="flex flex-wrap gap-2" aria-label="Academic year">{cycles.map((item: Record<string, unknown>) => <Link key={String(item.id)} href={`/accreditation/library?cycle=${item.id}`} className={`rounded px-4 py-2 text-sm font-bold ${cycle?.id === item.id ? "bg-brand text-white" : "bg-canvas text-muted hover:text-ink"}`}>{String(item.label)}</Link>)}</nav> : null}
      <section className="card">
        <div className="card-header"><span className="card-title">Add evidence</span><span className="card-subtitle">PDF, DOCX, XLSX, text, Markdown, CSV, or JSON · 25 MB maximum</span></div>
        <form action={uploadSource} className="card-body border-t border-rule grid gap-4 md:grid-cols-2">
          <label className="field-label">Academic year<input type="hidden" name="cycleId" value={String(cycle?.id ?? "")} /><span className="field-input flex items-center">{cycle ? String(cycle.label) : "Create an academic year first"}</span></label>
          <label className="field-label">Term<select className="field-input" name="termId"><option value="">Whole academic year</option>{terms.map((term) => <option key={String(term.id)} value={String(term.id)}>{String(term.label)}</option>)}</select></label>
          <label className="field-label">Source class<select className="field-input" name="kind" defaultValue="chapter_evidence"><option value="official_guideline">Official guideline</option><option value="prior_submission">Prior submission</option><option value="chapter_evidence">Chapter evidence</option><option value="blank_template">Blank template reference</option></select></label>
          <label className="field-label">Report scope<select className="field-input" name="reportKey"><option value="">Available to all reports</option>{Object.values(REPORT_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label>
          <label className="field-label md:col-span-2">File<input className="file-input mt-1" type="file" name="file" required /></label>
          <div><Button type="submit" disabled={!cycle}>Upload and process</Button></div>
        </form>
      </section>
      <section className="card">
        <div className="card-header"><span className="card-title">{cycle ? `${cycle.label} evidence` : "Evidence"}</span><span className="card-subtitle">{sources.length} file{sources.length === 1 ? "" : "s"}</span></div>
        <div className="table-scroll border-t border-rule"><table className="data-table"><thead><tr><th>File</th><th>Class</th><th>Report</th><th>Status</th><th /></tr></thead><tbody>{sources.length ? sources.map((source: Record<string, unknown>) => <tr key={String(source.id)}><td><a className="font-bold text-brand hover:underline" href={`/api/accreditation/sources/${source.id}`}>{String(source.original_name)}</a>{source.processing_error ? <p className="mt-1 max-w-md text-xs text-warn">{String(source.processing_error)}</p> : null}</td><td>{String(source.kind).replaceAll("_", " ")}</td><td>{source.report_key ? REPORT_DEFINITIONS[source.report_key as keyof typeof REPORT_DEFINITIONS]?.name : "All reports"}</td><td><span className={`badge ${source.status === "ready" ? "badge-approved" : source.status === "failed" ? "badge-denied" : "badge-pending"}`}>{String(source.status)}</span></td><td>{source.status !== "archived" ? <form action={archiveSource}><input type="hidden" name="sourceId" value={String(source.id)} /><button className="text-xs font-bold text-muted hover:text-ink" type="submit">Archive</button></form> : null}</td></tr>) : <tr><td colSpan={5} className="text-muted">No evidence uploaded for this year.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
