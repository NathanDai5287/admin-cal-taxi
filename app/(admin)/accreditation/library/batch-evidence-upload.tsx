"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { BatchUploadQueue, processQueuedDocument, useBatchUploadQueue, type BatchQueueItem } from "@/components/accreditation/batch-upload-queue";
import { Button } from "@/components/brand/button";
import { MAX_BATCH_DOCUMENTS } from "@/lib/accreditation/batch";
import { REPORT_DEFINITIONS } from "@/lib/accreditation/definitions";
import { createAccreditationBatchItem, processAccreditationBatchItem } from "../actions";

type Option = { id: string; label: string };

export function BatchEvidenceUpload({ cycle, terms }: { cycle: Option | null; terms: Option[] }) {
  const router = useRouter();
  const { items, setItems, updateItem } = useBatchUploadQueue("accreditation");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running || !cycle) return;
    const form = new FormData(event.currentTarget);
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length || files.length > MAX_BATCH_DOCUMENTS) {
      setError(`Choose between 1 and ${MAX_BATCH_DOCUMENTS} documents.`);
      return;
    }
    setError("");
    setRunning(true);
    const queue: BatchQueueItem[] = files.map((file) => ({ localId: crypto.randomUUID(), name: file.name, phase: "queued", message: "Waiting to upload", completed: 0, total: 0, attempt: 0 }));
    setItems(queue);
    try {
      const created: Array<{ localId: string; sourceId: string }> = [];
      for (const [index, file] of files.entries()) {
        const item = queue[index];
        updateItem(item.localId, { phase: "uploading", message: "Uploading document" });
        const upload = new FormData();
        for (const key of ["cycleId", "termId", "kind", "reportKey", "signatureFree"]) {
          const value = form.get(key);
          if (value !== null) upload.set(key, value);
        }
        upload.set("file", file);
        const result = await createAccreditationBatchItem(upload);
        if (!result.ok || !result.id) {
          updateItem(item.localId, { phase: "failed", message: result.message });
          continue;
        }
        updateItem(item.localId, { sourceId: result.id, phase: "queued", message: result.message });
        created.push({ localId: item.localId, sourceId: result.id });
        router.refresh();
      }
      for (const document of created) {
        await processQueuedDocument({ localId: document.localId, sourceId: document.sourceId, update: updateItem, process: processAccreditationBatchItem, refresh: router.refresh });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The batch was interrupted. Documents already uploaded remain in the library.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="card-body border-t border-rule grid gap-4 md:grid-cols-2">
      <label className="field-label">Academic year<input type="hidden" name="cycleId" value={cycle?.id ?? ""} /><span className="field-input flex items-center">{cycle?.label ?? "Create an academic year first"}</span></label>
      <label className="field-label">Term<select className="field-input" name="termId"><option value="">Whole academic year</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
      <label className="field-label">Source class<select className="field-input" name="kind" defaultValue="chapter_evidence"><option value="official_guideline">Official guideline</option><option value="prior_submission">Prior submission</option><option value="chapter_evidence">Chapter evidence</option><option value="blank_template">Blank template reference</option></select></label>
      <label className="field-label">Report scope<select className="field-input" name="reportKey"><option value="">Available to all reports</option>{Object.values(REPORT_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.name}</option>)}</select></label>
      <label className="field-label md:col-span-2">Documents<input className="file-input mt-1" type="file" name="files" multiple required accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json" /></label>
      <label className="block text-sm md:col-span-2"><input type="checkbox" name="signatureFree" required /> I removed signatures and unnecessary personal information from every selected document.</label>
      {error ? <p className="form-message md:col-span-2" role="alert">{error}</p> : null}
      <div className="md:col-span-2"><Button type="submit" disabled={!cycle || running}>{running ? "Processing batch…" : "Upload and process documents"}</Button></div>
      <div className="md:col-span-2"><BatchUploadQueue items={items} /></div>
    </form>
  );
}
