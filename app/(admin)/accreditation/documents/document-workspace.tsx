"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/brand/button";
import { accreditationDocumentSchema } from "@/lib/accreditation/document";
import type { DocumentRequestInput, DocumentWorkspaceData } from "@/lib/accreditation/document-ui-types";
import { refreshDocumentWorkspace, requestDocumentChange } from "../document-actions";
import { approveReport } from "../actions";
import { DocumentEditor } from "./document-editor";

export function DocumentWorkspace({ initial, canWrite }: { initial: DocumentWorkspaceData; canWrite: boolean }) {
  const [data, setData] = useState(initial);
  const [document, setDocument] = useState(initial.state.document);
  const [exampleIds, setExampleIds] = useState(initial.state.example_ids);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition();
  const [view, setView] = useState<"edit" | "pdf">("edit");
  const approved = data.run.status === "approved";
  const editable = canWrite && !approved;
  const dirty = JSON.stringify(document) !== JSON.stringify(data.state.document) || JSON.stringify(exampleIds) !== JSON.stringify(data.state.example_ids);
  const latest = data.revisions[0];
  const artifact = latest?.accreditation_artifacts.find(item => item.kind === (approved ? "approved" : "draft"));
  const outdated = dirty || latest?.document_version !== data.state.document_version;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function refresh(replaceDraft = true) {
    const next = await refreshDocumentWorkspace(data.run.id) as DocumentWorkspaceData;
    setData(next);
    if (replaceDraft) { setDocument(next.state.document); setExampleIds(next.state.example_ids); }
    return next;
  }
  async function send(input: DocumentRequestInput) {
    const result = await requestDocumentChange(input);
    if (!result.ok) { await refresh(false); throw new Error(result.error); }
    return refresh();
  }
  function action(work: () => Promise<void>) {
    setError(""); setNotice("");
    startTransition(async () => { try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "The request failed. Your previous draft is saved."); } });
  }
  async function saveIfNeeded() {
    if (!dirty || !document) return data;
    const parsed = accreditationDocumentSchema.safeParse(document);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check your document.");
    return send({ id: crypto.randomUUID(), runId: data.run.id, kind: "save", version: data.state.document_version, payload: { document: parsed.data, exampleIds } });
  }
  const autosave = useEffectEvent(() => action(async () => { await saveIfNeeded(); }));
  useEffect(() => {
    if (!dirty || busy || !editable || !document || !exampleIds.length || error) return;
    const timer = setTimeout(() => autosave(), 1500);
    return () => clearTimeout(timer);
  }, [dirty, busy, editable, document, exampleIds, error]);
  return <div className="space-y-5">
    <header><Link href="/accreditation/documents" className="text-sm text-brand underline">Document types</Link><h1 className="page-title mt-3">{data.family.name}</h1><p className="page-lede">{data.period} · {approved ? "Approved and archived" : "Describe the changes, review the draft, and generate a PDF."}</p></header>
    {error && <p className="form-message" role="alert">{error}</p>}
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-5 min-w-0">
        <details className="border-y border-rule py-3"><summary className="font-semibold cursor-pointer">Examples ({exampleIds.length})</summary><div className="space-y-3 mt-3">{data.examples.map(example => <label key={example.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={exampleIds.includes(example.id)} disabled={!editable || busy} onChange={event => setExampleIds(event.target.checked ? [...exampleIds, example.id] : exampleIds.filter(id => id !== example.id))} /><span className="break-words">{example.original_name}</span></label>)}<Link className="text-sm text-brand underline" href="/accreditation/documents">Add supporting examples</Link></div></details>
        <section aria-label="Document conversation" className="space-y-4">
          {!data.messages.length && <p className="text-sm text-muted">Try “Create this year’s version, with an alumni dinner in October and a spring service event.”</p>}
          <div className="max-h-[32rem] overflow-y-auto space-y-4">{data.messages.map(item => <article key={item.id} className={`p-3 text-sm ${item.role === "user" ? "bg-brand-light" : "bg-canvas border border-rule"}`}><p className="font-bold mb-2">{item.role === "user" ? "You" : "Assistant"}</p><p className="whitespace-pre-wrap break-words leading-relaxed">{item.content}</p></article>)}</div>
          {editable && <form className="space-y-3" onSubmit={event => { event.preventDefault(); action(async () => { const saved = await saveIfNeeded(); await send({ id: crypto.randomUUID(), runId: data.run.id, kind: "chat", version: saved.state.document_version, payload: { message, exampleIds } }); setMessage(""); setNotice("Draft saved."); }); }}><label className="field-label">What should change?<textarea className="field-textarea min-h-28" value={message} maxLength={8000} required disabled={busy} onChange={event => setMessage(event.target.value)} /></label><Button type="submit" disabled={busy || !exampleIds.length}>{busy ? "Working…" : document ? "Update draft" : "Create draft"}</Button><p className="text-xs text-muted">Messages and completed drafts are saved. You can also edit the document directly.</p></form>}
        </section>
        {data.state.readiness.questions?.length ? <section className="border-t border-rule pt-4"><h2 className="font-semibold">Details to confirm</h2><ul className="list-disc pl-5 mt-2 text-sm space-y-2">{data.state.readiness.questions.map((question, i) => <li key={i}>{question}</li>)}</ul></section> : null}
        {data.state.readiness.reviewNotes?.length ? <details className="border-t border-rule pt-4"><summary className="font-semibold cursor-pointer">Review notes ({data.state.readiness.reviewNotes.length})</summary><ul className="list-disc pl-5 mt-2 text-sm space-y-2">{data.state.readiness.reviewNotes.map((note, i) => <li key={i}>{note}</li>)}</ul></details> : null}
        {editable && data.requests.filter(item => item.version === data.state.document_version).map(item => <div key={item.id} className="border border-rule p-3 text-sm space-y-2"><p>{item.error ?? "This request may still be processing. Retry after a few minutes if it was interrupted."}</p><Button compact variant="secondary" disabled={busy || dirty} onClick={() => action(async () => { await send({ id: item.id, runId: data.run.id, kind: item.kind, version: item.version, payload: item.payload }); setNotice("Request completed."); })}>Retry {item.kind === "chat" ? "draft" : item.kind === "pdf" ? "PDF" : "save"}</Button></div>)}
      </aside>
      <section className="min-w-0 border border-rule bg-white p-4 sm:p-6 space-y-5" aria-label="Document preview">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{view === "edit" ? "Editable draft" : "PDF preview"}</h2><div className="flex flex-wrap gap-2">
          {artifact && <Button compact variant="secondary" onClick={() => setView(view === "edit" ? "pdf" : "edit")}>{view === "edit" ? "View PDF" : "Edit draft"}</Button>}
          {editable && document && <><Button compact variant="secondary" disabled={!dirty || busy || !exampleIds.length} onClick={() => action(async () => { await saveIfNeeded(); setNotice("Changes saved."); })}>Save edits</Button><Button compact disabled={busy || !exampleIds.length} onClick={() => action(async () => { const saved = await saveIfNeeded(); await send({ id: crypto.randomUUID(), runId: data.run.id, kind: "pdf", version: saved.state.document_version, payload: { exampleIds } }); setView("pdf"); setNotice("PDF generated and saved."); })}>Generate PDF</Button></>}
        </div></div>
        <p role="status" className="text-xs text-muted">{dirty ? "Unsaved edits. Save or generate a PDF to keep them." : "All changes saved."}{artifact && outdated ? " The last PDF is from an earlier draft." : ""}</p>
        {view === "pdf" && artifact ? <iframe title="Generated accreditation PDF" src={`/api/accreditation/artifacts/${artifact.id}?inline=1`} className="w-full h-[75vh] border border-rule" /> : document ? <DocumentEditor document={document} disabled={!editable || busy} onChange={setDocument} /> : <div className="py-16 text-center text-muted"><p className="font-semibold">Your document will appear here.</p><p className="text-sm mt-2">Ask for a new version using the examples you uploaded.</p></div>}
        {artifact && <div className="border-t border-rule pt-4 space-y-4"><a className="font-bold text-brand underline" href={`/api/accreditation/artifacts/${artifact.id}`}>Download {approved ? "approved" : "last generated"} PDF</a>{editable && !outdated && data.run.status === "ready_for_review" && <form action={approveReport} className="space-y-3"><input type="hidden" name="runId" value={data.run.id} /><input type="hidden" name="revisionId" value={latest.id} /><label className="check-row"><input type="checkbox" name="reviewed" required /><span>I reviewed this PDF and it is ready to archive.</span></label><Button type="submit" variant="secondary" disabled={busy}>Approve and archive</Button></form>}</div>}
        {data.revisions.length > 1 && <details><summary className="cursor-pointer font-semibold text-sm">Previous PDFs</summary><ul className="mt-2 space-y-2 text-sm">{data.revisions.slice(1).map(revision => <li key={revision.id}>{revision.accreditation_artifacts.map(file => <a key={file.id} className="block text-brand underline" href={`/api/accreditation/artifacts/${file.id}`}>Revision {revision.revision_number} · {file.filename}</a>)}</li>)}</ul></details>}
      </section>
    </div>
  </div>;
}
