"use client";

import { memo, useEffect, useId, useState } from "react";

import { Button } from "@/components/brand/button";
import { EVIDENCE_SEARCH_LIMIT, type EvidenceSource } from "@/lib/accreditation/evidence-list";
import { archiveSource, deleteSource, reprocessSource } from "../actions";

type Family = { id: string; label: string };
type SearchState = {
  term: string;
  sources: EvidenceSource[];
  count: number;
  loading: boolean;
  error: string;
};

const EvidenceTable = memo(function EvidenceTable({
  sources,
  families,
  emptyMessage,
  id,
}: {
  sources: EvidenceSource[];
  families: Family[];
  emptyMessage: string;
  id: string;
}) {
  const familyNames = new Map(families.map((family) => [family.id, family.label]));
  return (
    <table id={id} className="data-table">
      <thead><tr><th scope="col">File</th><th scope="col">Class</th><th scope="col">Form</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
      <tbody>
        {sources.length ? sources.map((source) => (
          <tr key={source.id}>
            <td>
              <a className="font-bold text-brand hover:underline" href={`/api/accreditation/sources/${source.id}`}>{source.original_name}</a>
              {source.processing_error ? <p className="mt-1 max-w-md text-xs text-warn">{source.processing_error}</p> : null}
            </td>
            <td>{source.kind.replaceAll("_", " ")}</td>
            <td>{source.template_family_id
              ? familyNames.get(source.template_family_id) ?? "Named form"
              : source.report_key ? source.report_key.replaceAll("_", " ") : "All forms"}</td>
            <td>
              <span className={`badge ${source.status === "ready" ? "badge-approved" : source.status === "failed" ? "badge-denied" : "badge-pending"}`}>{source.status}</span>
              {source.processing_total > 0 ? <p className="mt-1 text-xs text-muted">{source.processing_completed}/{source.processing_total} passages embedded</p> : null}
            </td>
            <td>
              {source.status !== "archived" ? <form action={reprocessSource} className="space-y-2">
                <input type="hidden" name="sourceId" value={source.id} />
                <label className="block text-xs"><input name="signatureFree" type="checkbox" required /> Source and text contain no signatures</label>
                <button type="submit" className="text-xs font-bold text-brand">Reprocess / re-embed</button>
                <p className="mt-1 text-xs text-muted">{source.active_embedding_profile ?? "Needs embedding migration"}</p>
              </form> : null}
              {source.status !== "archived" ? <form action={archiveSource}>
                <input type="hidden" name="sourceId" value={source.id} />
                <button className="text-xs font-bold text-muted hover:text-ink" type="submit">Archive</button>
              </form> : null}
              <form action={deleteSource} className="mt-2 space-y-2 border-t border-rule pt-2">
                <label className="block text-xs"><input name="confirmDelete" type="checkbox" required /> Permanently delete original and embeddings</label>
                <Button type="submit" variant="danger" compact>Delete permanently</Button>
              </form>
            </td>
          </tr>
        )) : <tr><td colSpan={5} className="text-muted">{emptyMessage}</td></tr>}
      </tbody>
    </table>
  );
});

export function EvidenceDocuments({
  cycleId,
  cycleLabel,
  initialSources,
  initialCount,
  families,
  initialError,
}: {
  cycleId: string;
  cycleLabel: string;
  initialSources: EvidenceSource[];
  initialCount: number;
  families: Family[];
  initialError?: string;
}) {
  const searchId = useId();
  const tableId = useId();
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState<SearchState>({
    term: "",
    sources: initialSources,
    count: initialCount,
    loading: false,
    error: "",
  });
  const term = query.trim();

  useEffect(() => {
    if (!term || !cycleId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearch((current) => ({ ...current, loading: true, error: "" }));
      const params = new URLSearchParams({ cycleId, q: term });
      void fetch(`/api/accreditation/evidence/search?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as { sources?: EvidenceSource[]; count?: number; error?: string } | null;
          if (!response.ok || !payload || !Array.isArray(payload.sources)) throw new Error(payload?.error ?? "Search is temporarily unavailable. Try again.");
          return { sources: payload.sources, count: typeof payload.count === "number" ? payload.count : payload.sources.length };
        })
        .then((payload) => {
          if (!controller.signal.aborted) setSearch({ term, sources: payload.sources, count: payload.count, loading: false, error: "" });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setSearch({ term, sources: [], count: 0, loading: false, error: error instanceof Error ? error.message : "Search is temporarily unavailable. Try again." });
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, cycleId, initialSources, retry]);

  const searching = Boolean(term) && (search.term !== term || search.loading);
  const sources = term ? search.sources : initialSources;
  const count = term ? search.count : initialCount;
  const error = term ? searching ? "" : search.error : initialError;
  const emptyMessage = searching ? "Searching documents…" : error
    ? error
    : term ? `No documents match “${term}” in this academic year.` : "No evidence uploaded for this year.";
  const countLabel = searching ? "Searching…" : error ? "Search unavailable" : term
    ? `${count} match${count === 1 ? "" : "es"}`
    : `${initialCount} file${initialCount === 1 ? "" : "s"}`;

  return (
    <section className="card">
      <div className="card-header"><span className="card-title">{cycleLabel ? `${cycleLabel} evidence` : "Evidence"}</span><span className="card-subtitle">{countLabel}</span></div>
      <div className="flex flex-col gap-3 border-t border-rule px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
        <label htmlFor={searchId} className="field-label mb-0 w-full max-w-md">
          Search documents
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            disabled={!cycleId}
            autoComplete="off"
            aria-controls={tableId}
            placeholder="Search file names"
            className="field-input mt-2"
          />
        </label>
        <div className="flex min-h-9 items-center gap-4 sm:justify-end">
          {query ? <button type="button" onClick={() => setQuery("")} className="text-xs font-bold text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Clear search</button> : null}
          <p className="text-xs text-muted" role="status" aria-live="polite">
            {searching ? "Searching…" : error ? error : term && count > EVIDENCE_SEARCH_LIMIT
              ? `Showing first ${sources.length} of ${count} matches`
              : !term && initialCount > initialSources.length
                ? `Showing latest ${initialSources.length} of ${initialCount} files`
                : term ? countLabel : "Search by file name"}
          </p>
          {error && term ? <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-xs font-bold text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Try again</button> : null}
        </div>
      </div>
      <div className="table-scroll border-t border-rule" aria-busy={searching}>
        <EvidenceTable id={tableId} sources={sources} families={families} emptyMessage={emptyMessage} />
      </div>
    </section>
  );
}
