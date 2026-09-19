"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BatchUploadQueue, processQueuedDocument, useBatchUploadQueue, type BatchQueueItem } from "@/components/accreditation/batch-upload-queue";
import { MAX_BATCH_DOCUMENTS } from "@/lib/accreditation/batch";
import { createPolicyBatchItem, processPolicyBatchItem } from "./actions";

const button = "rounded bg-brand px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

function documentTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 200) || "Untitled policy";
}

export function BatchPolicyUpload() {
  const router = useRouter();
  const { items, setItems, updateItem } = useBatchUploadQueue("policy");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
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
        for (const key of ["authority", "document_type", "version_label", "effective_from", "effective_until", "signatureFree"]) {
          const value = form.get(key);
          if (value !== null) upload.set(key, value);
        }
        upload.set("title", documentTitle(file.name));
        upload.set("file", file);
        const result = await createPolicyBatchItem(upload);
        if (!result.ok || !result.id) {
          updateItem(item.localId, { phase: "failed", message: result.message });
          continue;
        }
        updateItem(item.localId, { sourceId: result.id, phase: "queued", message: result.message });
        created.push({ localId: item.localId, sourceId: result.id });
        router.refresh();
      }
      for (const document of created) {
        await processQueuedDocument({ localId: document.localId, sourceId: document.sourceId, update: updateItem, process: processPolicyBatchItem, refresh: router.refresh });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The batch was interrupted. Documents already uploaded remain in the library.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="card-body space-y-4">
      <p className="text-sm text-muted">Shared metadata applies to every selected file. Draft titles are derived from filenames and can be edited before publishing.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">Issuing authority<input className="field-input" name="authority" required maxLength={200} /></label>
        <label className="field-label">Version<input className="field-input" name="version_label" required maxLength={100} /></label>
        <label className="field-label">Document type<select className="field-input" name="document_type" defaultValue="policy">{["policy", "bylaws", "rules", "guidelines"].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="field-label">Effective from<input type="date" name="effective_from" className="field-input" required /></label>
        <label className="field-label">Effective through (optional)<input type="date" name="effective_until" className="field-input" /></label>
      </div>
      <label className="field-label">Source documents<input type="file" name="files" multiple required className="file-input" accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json" /></label>
      <label className="block text-sm"><input type="checkbox" name="signatureFree" required /> I removed signatures and unnecessary personal information from every selected document.</label>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      <button className={button} disabled={running}>{running ? "Processing batch…" : "Upload and process documents"}</button>
      <BatchUploadQueue items={items} />
    </form>
  );
}
