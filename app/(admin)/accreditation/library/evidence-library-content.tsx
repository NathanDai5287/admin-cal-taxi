import Link from "next/link";

import {
  EVIDENCE_SOURCE_COLUMNS,
  INITIAL_EVIDENCE_LIMIT,
  type EvidenceSource,
} from "@/lib/accreditation/evidence-list";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { BatchEvidenceUpload } from "./batch-evidence-upload";
import { EvidenceDocuments } from "./evidence-documents";

export async function EvidenceLibraryContent({
  searchParams,
  basePath,
}: {
  searchParams: Promise<{ cycle?: string; result?: string }>;
  basePath: "/accreditation/library" | "/ask-policy/evidence";
}) {
  const params = await searchParams;
  const supabase = createAccreditationAdminClient();
  const [cyclesResult, familiesResult] = await Promise.all([
    supabase.from("academic_years").select("*, academic_terms(*)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_template_families").select("id,name").is("archived_at", null).order("name"),
  ]);
  const cycles = cyclesResult.data ?? [];
  const cycle = cycles.find((item: Record<string, unknown>) => item.id === params.cycle) ?? cycles[0] ?? null;
  const terms = (cycle?.academic_terms ?? []) as Array<Record<string, unknown>>;
  const families: Array<{ id: string; label: string }> = (familiesResult.data ?? []).map((family: Record<string, unknown>) => ({
    id: String(family.id),
    label: String(family.name),
  }));

  let sources: EvidenceSource[] = [];
  let sourceCount = 0;
  let sourceError = false;
  if (cycle) {
    const result = await supabase.from("accreditation_sources")
      .select(EVIDENCE_SOURCE_COLUMNS, { count: "exact" })
      .eq("cycle_id", String(cycle.id))
      .order("created_at", { ascending: false })
      .limit(INITIAL_EVIDENCE_LIMIT);
    sources = (result.data ?? []) as EvidenceSource[];
    sourceCount = result.count ?? sources.length;
    sourceError = Boolean(result.error);
  }

  return (
    <div className="space-y-7">
      <section><p className="page-eyebrow">Evidence library</p><h1 className="page-title">Sources and proof</h1><p className="page-lede">Uploaded content is treated as untrusted evidence, never as instructions to the system.</p></section>
      {params.result ? <p className="form-message" role="status">{params.result.replaceAll("_", " ")}</p> : null}
      {cycles.length ? <nav className="flex flex-wrap gap-2" aria-label="Academic year">{cycles.map((item: Record<string, unknown>) => <Link key={String(item.id)} href={`${basePath}?cycle=${item.id}`} className={`px-4 py-2 text-sm font-bold ${cycle?.id === item.id ? "bg-brand text-white" : "bg-canvas text-muted hover:text-ink"}`}>{String(item.label)}</Link>)}</nav> : null}
      <section className="card">
        <div className="card-header"><span className="card-title">Add evidence</span><span className="card-subtitle">Up to 20 files per batch · PDF, DOCX, XLSX, text, Markdown, CSV, or JSON · 25 MB each</span></div>
        <BatchEvidenceUpload cycle={cycle ? { id: String(cycle.id), label: String(cycle.label) } : null} terms={terms.map((term) => ({ id: String(term.id), label: String(term.label) }))} families={families} />
      </section>
      <EvidenceDocuments
        key={String(cycle?.id ?? "none")}
        cycleId={cycle ? String(cycle.id) : ""}
        cycleLabel={cycle ? String(cycle.label) : ""}
        initialSources={sources}
        initialCount={sourceCount}
        families={families}
        initialError={sourceError ? "Evidence could not be loaded. Reload the page." : undefined}
        basePath={basePath}
      />
    </div>
  );
}
