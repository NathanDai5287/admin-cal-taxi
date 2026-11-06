"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/brand/button";
import type { DocumentLibraryData, DocumentExample, DocumentFamily } from "@/lib/accreditation/document-ui-types";
import { beginExampleDocument, completeDocumentUpload, createDocumentFromExisting, processDocumentExample, refreshDocumentLibrary, reserveDocumentBatch, updateDocumentFamily } from "../document-actions";

export function DocumentLibrary({ initial, canWrite }: { initial: DocumentLibraryData; canWrite: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState(initial.families[0]?.id ?? "");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [activeBatch, setActiveBatch] = useState(initial.examples.at(-1)?.batch_id ?? "");
  const paused = useRef(false);
  const today = new Date().toISOString().slice(0, 10);
  const [yearId, setYearId] = useState(initial.years.find(year => year.starts_on <= today && year.ends_on >= today)?.id ?? initial.years[0]?.id ?? "");
  const [termId, setTermId] = useState("");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const family = data.families.find(item => item.id === selected);
  const examples = data.examples.filter(item => item.family_id === selected);
  const readyIds = examples.filter(item => item.status === "ready").map(item => item.id);
  const selectedIds = chosen ?? readyIds;
  const pending = data.examples.filter(item => !["ready", "uploading"].includes(item.status));
  async function refresh() { const next = await refreshDocumentLibrary() as DocumentLibraryData; setData(next); return next; }
  function act(work: () => Promise<void>) {
    setMessage("");
    startTransition(async () => { try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to complete this step. Try again."); } finally { setProgress(""); } });
  }
  async function process(ids: string[]) {
    paused.current = false;
    for (const id of ids) {
      let ready = false;
      while (!ready && !paused.current) {
        setProgress("Reading examples. Completed pages are saved as we go.");
        const result = await processDocumentExample(id);
        await refresh();
        if (!result.ok) {
          setMessage(result.error);
          // Quota and busy failures pause the batch. File-specific failures allow later files to continue.
          if (/capacity|quota|busy|cooling|retry time/i.test(result.error)) return;
          break;
        }
        ready = result.data.ready;
      }
      if (paused.current) break;
    }
  }
  async function upload(files: File[], familyId: string | null, existing?: DocumentExample) {
    if (!files.length) return;
    if (files.length > 30) throw new Error("Choose up to 30 files per batch.");
    for (const file of files) if (!/\.(pdf|docx|xlsx)$/i.test(file.name) || !file.size || file.size > 25 * 1024 * 1024) throw new Error("Choose PDF, DOCX, or XLSX files up to 25 MB each.");
    if (existing && (files[0].name !== existing.original_name || files[0].size !== existing.size_bytes)) throw new Error("Select the same original file to resume its upload.");
    const batchId = existing?.batch_id ?? crypto.randomUUID();
    setActiveBatch(batchId);
    // Reusing a reserved batch requires its original family scope, carried by the server's existing batch.
    const result = await reserveDocumentBatch({ id: batchId, familyId: existing ? existing.uploadFamilyId : familyId, files: files.map(file => ({ id: existing?.id ?? crypto.randomUUID(), name: file.name, size: file.size })) });
    if (!result.ok) throw new Error(result.error);
    const completed: string[] = [];
    for (let index = 0; index < files.length; index++) {
      const item = result.data[index];
      setProgress(`Uploading ${index + 1} of ${files.length}: ${files[index].name}`);
      try {
        if (item.signedUrl) {
          const response = await fetch(item.signedUrl, { method: "PUT", headers: { "Content-Type": item.mimeType, "x-upsert": "false" }, body: files[index] });
          if (!response.ok) {
            // A previous response may have been lost after storage accepted the file.
            const finish = await completeDocumentUpload(item.id);
            if (!finish.ok) throw new Error(`Upload failed for ${files[index].name}. Select it again to resume.`);
          }
        }
        const finish = await completeDocumentUpload(item.id);
        if (!finish.ok) throw new Error(finish.error);
        completed.push(item.id);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Select the file again to resume."); }
      const next = await refresh();
      if (!selected) setSelected(next.examples.find(example => example.id === item.id)?.family_id ?? "");
    }
    await process(completed);
  }
  function choose(id: string) { setSelected(id); setChosen(null); setMessage(""); }
  const year = data.years.find(item => item.id === yearId);
  return <div className="space-y-7">
    <header><h1 className="page-title">Document types</h1><p className="page-lede">Upload previous submissions, describe what should change, and create a fresh PDF.</p></header>
    {message && <p role="alert" className="form-message">{message}</p>}
    {canWrite && <section className="border-y border-rule py-5 space-y-3" aria-label="Upload examples">
      <label className="field-label">Add document types<input type="file" multiple accept=".pdf,.docx,.xlsx" className="file-input mt-2" disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; act(() => upload(files, null)); }} /></label>
      <p className="text-sm text-muted">Choose up to 30 examples at once. Each file becomes its own document type, named from the filename. PDF, Word, or Excel; 25 MB per file.</p>
      <div className="flex flex-wrap items-center gap-3"><p role="status" aria-live="polite" className="text-sm text-muted">{progress || (pending.length ? `${pending.length} example${pending.length === 1 ? "" : "s"} waiting to finish.` : "Your uploads and drafts are saved privately.")}</p>
        {busy ? <Button variant="secondary" onClick={() => { paused.current = true; setProgress("Pausing after this step…"); }}>Pause processing</Button> : pending.length > 0 && <Button variant="secondary" onClick={() => act(() => process(pending.map(item => item.id)))}>Resume processing</Button>}
      </div>
    </section>}
    {activeBatch && <details open={busy} className="border-b border-rule pb-4"><summary className="font-semibold cursor-pointer">Upload batch · {data.examples.filter(item => item.batch_id === activeBatch).length} files</summary><div className="mt-3 divide-y divide-rule">{data.examples.filter(item => item.batch_id === activeBatch).map(item => { const type = data.families.find(family => family.id === item.family_id); return <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center"><button type="button" className="text-left text-sm text-brand underline break-words" onClick={() => choose(item.family_id)}>{item.original_name}</button><input key={type?.name} className="field-input" aria-label={`Name for ${item.original_name}`} defaultValue={type?.name ?? ""} maxLength={160} disabled={busy || !canWrite} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={event => { const name = event.target.value.trim(); if (type && name && name !== type.name) act(async () => { const result = await updateDocumentFamily({ id: type.id, name, guidance: type.guidance }); if (!result.ok) throw new Error(result.error); await refresh(); }); }} /><span className="text-xs text-muted">{item.status === "uploading" ? "Awaiting file" : item.status === "ready" ? "Ready" : `${item.completedPages}/${item.page_count ?? "?"} pages · ${item.status}`}</span></div>; })}</div></details>}
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Saved document types" className="space-y-1">
        {!data.families.length && <p className="text-sm text-muted">Upload examples to start your document library.</p>}
        {data.families.map(item => { const rows = data.examples.filter(example => example.family_id === item.id); return <button key={item.id} type="button" onClick={() => choose(item.id)} aria-current={item.id === selected ? "page" : undefined} className={`w-full border p-3 text-left ${item.id === selected ? "border-brand bg-brand-light" : "border-transparent hover:border-rule"}`}><span className="block font-bold break-words">{item.name}</span><span className="text-xs text-muted">{rows.filter(row => row.status === "ready").length} of {rows.length} examples ready</span></button>; })}
      </nav>
      {family ? <section className="min-w-0 space-y-6" key={family.id}>
        <FamilySettings key={family.name} family={family} canWrite={canWrite} busy={busy} save={(name, guidance) => act(async () => { const result = await updateDocumentFamily({ id: family.id, name, guidance }); if (!result.ok) throw new Error(result.error); await refresh(); })} />
        <section className="space-y-3"><h2 className="text-lg font-bold">Examples</h2>
          {examples.map(example => <article key={example.id} className="border-b border-rule pb-4 space-y-2">
            <div className="flex items-start gap-3"><input aria-label={`Use ${example.original_name}`} type="checkbox" className="mt-1" checked={selectedIds.includes(example.id)} disabled={example.status !== "ready" || busy || !canWrite} onChange={event => setChosen(event.target.checked ? [...selectedIds, example.id] : selectedIds.filter(id => id !== example.id))} /><div className="min-w-0 flex-1"><a className="font-semibold text-brand underline break-words" href={`/api/accreditation/examples/${example.id}`}>{example.original_name}</a><p className="text-xs text-muted mt-1">{example.status === "uploading" ? "Waiting for upload" : example.status === "ready" ? "Ready" : `${example.completedPages} of ${example.page_count ?? "?"} pages read · ${example.status}`}</p></div>
            {canWrite && !busy && !["ready", "uploading"].includes(example.status) && <Button compact variant="secondary" onClick={() => act(() => process([example.id]))}>Retry</Button>}</div>
            {example.error && <p className="text-sm text-warn">{example.error}{example.retry_after ? ` Retry after ${new Date(example.retry_after).toLocaleTimeString()}.` : ""}</p>}
            {example.status === "uploading" && canWrite && <label className="field-label">Resume with the original file<input type="file" accept=".pdf,.docx,.xlsx" disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; act(async () => { const finished = await completeDocumentUpload(example.id); if (finished.ok) { await process([example.id]); return; } await upload(files, null, example); }); }} /></label>}
            {example.analysis?.suggestedName && example.analysis.suggestedName !== family.name && canWrite && <Button compact variant="text" disabled={busy} onClick={() => act(async () => { const result = await updateDocumentFamily({ id: family.id, name: example.analysis!.suggestedName!, guidance: family.guidance }); if (!result.ok) throw new Error(result.error); await refresh(); })}>Use suggested name: {example.analysis.suggestedName}</Button>}
            {example.analysis?.description && <p className="text-sm text-muted">{example.analysis.description}</p>}
          </article>)}
          {canWrite && <label className="field-label">Add examples to this type<input type="file" multiple accept=".pdf,.docx,.xlsx" disabled={busy} className="file-input mt-2" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; act(() => upload(files, family.id)); }} /></label>}
        </section>
        {canWrite && <section className="border-t border-rule pt-5 space-y-4"><h2 className="text-lg font-bold">Create a document</h2>
          {year ? <><div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Academic year<select className="field-input" value={yearId} disabled={busy} onChange={event => { setYearId(event.target.value); setTermId(""); }}>{data.years.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="field-label">Period<select className="field-input" value={termId} disabled={busy} onChange={event => setTermId(event.target.value)}><option value="">Full academic year</option>{year.academic_terms.map(term => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div><Button disabled={busy || !selectedIds.length} onClick={() => act(async () => { const result = await beginExampleDocument({ familyId: family.id, cycleId: yearId, termId: termId || null, exampleIds: selectedIds }); if (!result.ok) throw new Error(result.error); router.push(`/accreditation/reports/${result.data}`); })}>Start or continue draft</Button><p className="text-xs text-muted">Uses the selected examples. An existing draft for this period will reopen.</p></> : <Link href="/accreditation" className="text-brand underline">Create an academic year to begin.</Link>}
        </section>}
        <section className="space-y-2"><h2 className="text-lg font-bold">Saved submissions</h2>{data.runs.filter(run => run.template_family_id === family.id).map(run => <Link key={run.id} className="block text-brand underline" href={`/accreditation/reports/${run.id}`}>{run.title} · {run.status.replaceAll("_", " ")}</Link>)}</section>
      </section> : <div className="py-10 text-muted">Your examples become reusable starting points. Select a document type to create its next version.</div>}
    </div>
    <details className="border-t border-rule pt-5"><summary className="font-semibold cursor-pointer">Use an existing template or approved submission</summary><p className="text-sm text-muted my-3">Creates a new document type and keeps the original file.</p><div className="space-y-2">{[...data.templates.map(item => ({ id: item.id, name: item.original_name, source: "template" })), ...data.approved.map(item => ({ id: item.id, name: item.filename, source: "approved" }))].map(item => <div key={`${item.source}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2"><span className="text-sm break-words">{item.name}</span>{canWrite && <Button compact variant="secondary" disabled={busy} onClick={() => act(async () => { const result = await createDocumentFromExisting({ id: crypto.randomUUID(), sourceId: item.id, source: item.source }); if (!result.ok) throw new Error(result.error); await refresh(); await process([result.data]); })}>Use as example</Button>}</div>)}</div><Link className="inline-block mt-4 text-sm text-brand underline" href="/accreditation/templates">Open legacy templates</Link></details>
  </div>;
}

function FamilySettings({ family, busy, canWrite, save }: { family: DocumentFamily; busy: boolean; canWrite: boolean; save: (name: string, guidance: string) => void }) {
  const [name, setName] = useState(family.name);
  const [guidance, setGuidance] = useState(family.guidance);
  return <div className="space-y-3"><h2 className="text-xl font-bold">{family.name}</h2><details><summary className="cursor-pointer text-sm text-brand font-semibold">Name and reusable instructions</summary><form className="form-stack mt-3" onSubmit={event => { event.preventDefault(); save(name, guidance); }}><label className="field-label">Document type name<input className="field-input" maxLength={160} value={name} required disabled={!canWrite || busy} onChange={event => setName(event.target.value)} /></label><label className="field-label">Instructions for future drafts<textarea className="field-textarea" maxLength={5000} value={guidance} disabled={!canWrite || busy} onChange={event => setGuidance(event.target.value)} /></label>{canWrite && <Button type="submit" disabled={busy}>Save details</Button>}</form></details></div>;
}
