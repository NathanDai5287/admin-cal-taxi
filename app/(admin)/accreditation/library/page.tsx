import Link from "next/link";

import { Button } from "@/components/brand/button";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { archiveSource, deleteSource, reprocessSource } from "../actions";
import { BatchEvidenceUpload } from "./batch-evidence-upload";

export const dynamic = "force-dynamic";

export default async function EvidenceLibrary({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [cyclesResult, sourcesResult, familiesResult] = await Promise.all([
    supabase.from("academic_years").select("*, academic_terms(*)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_sources").select("*").order("created_at", { ascending: false }),
    supabase.from("accreditation_template_families").select("id,name").is("archived_at", null).order("name"),
  ]);
  const cycles = cyclesResult.data ?? [];
  const cycle = cycles.find((item: Record<string, unknown>) => item.id === params.cycle) ?? cycles[0] ?? null;
  const terms = (cycle?.academic_terms ?? []) as Array<Record<string, unknown>>;
  const sources = (sourcesResult.data ?? []).filter((source: Record<string, unknown>) => source.cycle_id === cycle?.id);
  const families: Array<{ id: string; label: string }> = (familiesResult.data ?? []).map((family: Record<string, unknown>) => ({ id: String(family.id), label: String(family.name) }));
  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Evidence library</p><h1 className="page-title">Sources and proof</h1><p className="page-lede">Uploaded content is treated as untrusted evidence, never as instructions to the system.</p></section>
      {params.result ? <p className="form-message" role="status">{params.result.replaceAll("_", " ")}</p> : null}
      {cycles.length ? <nav className="flex flex-wrap gap-2" aria-label="Academic year">{cycles.map((item: Record<string, unknown>) => <Link key={String(item.id)} href={`/accreditation/library?cycle=${item.id}`} className={`px-4 py-2 text-sm font-bold ${cycle?.id === item.id ? "bg-brand text-white" : "bg-canvas text-muted hover:text-ink"}`}>{String(item.label)}</Link>)}</nav> : null}
      <section className="card"><div className="card-header"><span className="card-title">Add evidence</span><span className="card-subtitle">Up to 20 files per batch · PDF, DOCX, XLSX, text, Markdown, CSV, or JSON · 25 MB each</span></div><BatchEvidenceUpload cycle={cycle ? { id: String(cycle.id), label: String(cycle.label) } : null} terms={terms.map((term) => ({ id: String(term.id), label: String(term.label) }))} families={families} /></section>
      <section className="card"><div className="card-header"><span className="card-title">{cycle ? `${cycle.label} evidence` : "Evidence"}</span><span className="card-subtitle">{sources.length} file{sources.length === 1 ? "" : "s"}</span></div><div className="table-scroll border-t border-rule"><table className="data-table"><thead><tr><th>File</th><th>Class</th><th>Form</th><th>Status</th><th /></tr></thead><tbody>{sources.length ? sources.map((source: Record<string, unknown>) => <tr key={String(source.id)}><td><a className="font-bold text-brand hover:underline" href={`/api/accreditation/sources/${source.id}`}>{String(source.original_name)}</a>{source.processing_error ? <p className="mt-1 max-w-md text-xs text-warn">{String(source.processing_error)}</p> : null}</td><td>{String(source.kind).replaceAll("_", " ")}</td><td>{source.template_family_id ? families.find((family) => family.id === String(source.template_family_id))?.label ?? "Named form" : source.report_key ? String(source.report_key).replaceAll("_", " ") : "All forms"}</td><td><span className={`badge ${source.status === "ready" ? "badge-approved" : source.status === "failed" ? "badge-denied" : "badge-pending"}`}>{String(source.status)}</span>{Number(source.processing_total) > 0 ? <p className="mt-1 text-xs text-muted">{Number(source.processing_completed)}/{Number(source.processing_total)} passages embedded</p> : null}</td><td>{source.status !== "archived" ? <form action={reprocessSource} className="space-y-2"><input type="hidden" name="sourceId" value={String(source.id)} /><label className="block text-xs"><input name="signatureFree" type="checkbox" required /> Source and text contain no signatures</label><button type="submit" className="text-xs font-bold text-brand">Reprocess / re-embed</button><p className="mt-1 text-xs text-muted">{String(source.active_embedding_profile ?? "Needs embedding migration")}</p></form> : null}{source.status !== "archived" ? <form action={archiveSource}><input type="hidden" name="sourceId" value={String(source.id)} /><button className="text-xs font-bold text-muted hover:text-ink" type="submit">Archive</button></form> : null}<form action={deleteSource} className="mt-2 space-y-2 border-t border-rule pt-2"><label className="block text-xs"><input name="confirmDelete" type="checkbox" required /> Permanently delete original and embeddings</label><Button type="submit" variant="danger" compact>Delete permanently</Button></form></td></tr>) : <tr><td colSpan={5} className="text-muted">No evidence uploaded for this year.</td></tr>}</tbody></table></div></section>
    </div>
  );
}
