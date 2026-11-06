import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { createAccreditationAdminClient } from "./supabase";
import { extractSource } from "./extract";
import { getAccreditationProviders } from "./providers";
import { GeminiLanguageModelProvider, isRetryableAiError } from "./gemini";
import { analyzeDocumentExample, draftExampleDocument, exampleAnalysisSchema, aiRetrySeconds } from "./document-ai";
import { accreditationDocumentSchema, exampleDocumentName, documentTableTotals } from "./document";
import { renderAccreditationDocument } from "./document-pdf";

export const EXAMPLE_BUCKET = "accreditation-examples";
const uuid = z.string().uuid();
const fileSchema = z.object({ id: uuid, name: z.string().min(1).max(250), size: z.number().int().min(1).max(25 * 1024 * 1024) });
const mimes: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function language() {
  const provider = getAccreditationProviders().language;
  if (!provider) throw new Error("Accreditation AI is not configured. Your files and drafts remain saved.");
  return provider instanceof GeminiLanguageModelProvider ? new GeminiLanguageModelProvider(provider.client, provider.model, undefined, []) : provider;
}
async function withAiGate<T>(operation: () => Promise<T>) {
  const db = createAccreditationAdminClient();
  const token = randomUUID();
  if (!checked(await db.rpc("accreditation_claim_ai", { p_token: token }))) throw new Error("AI processing is busy or cooling down. Progress is saved; resume in a minute.");
  let seconds = 0;
  try { return await operation(); }
  catch (error) { if (isRetryableAiError(error)) seconds = aiRetrySeconds(error); throw error; }
  finally { await db.rpc("accreditation_release_ai", { p_token: token, p_seconds: seconds }); }
}

export async function reserveExampleBatch(userId: string, input: unknown) {
  const value = z.object({ id: uuid, familyId: uuid.nullable(), files: z.array(fileSchema).min(1).max(30) }).parse(input);
  if (new Set(value.files.map(file => file.id)).size !== value.files.length) throw new Error("Duplicate upload IDs.");
  for (const file of value.files) if (!mimes[file.name.split(".").pop()!.toLowerCase()]) throw new Error("Choose PDF, DOCX, or XLSX examples.");
  const db = createAccreditationAdminClient();
  if (value.familyId) {
    const family = checked(await db.from("accreditation_template_families").select("id").eq("id", value.familyId).eq("workflow_mode", "example_document").is("archived_at", null).maybeSingle());
    if (!family) throw new Error("Document type not found.");
  }
  checked(await db.from("accreditation_example_batches").upsert({ id: value.id, family_id: value.familyId, created_by: userId }, { onConflict: "id", ignoreDuplicates: true }));
  const batch = checked(await db.from("accreditation_example_batches").select("created_by,family_id").eq("id", value.id).single()) as { created_by: string; family_id: string | null };
  if (batch.created_by !== userId || batch.family_id !== value.familyId) throw new Error("Batch does not match.");
  const items = [];
  for (const file of value.files) {
    const row = checked(await db.rpc("accreditation_reserve_example", { p_id: file.id, p_batch: value.id, p_family: value.familyId,
      p_name: exampleDocumentName(file.name), p_filename: file.name, p_mime: mimes[file.name.split(".").pop()!.toLowerCase()], p_size: file.size, p_user: userId })) as { id: string; storage_path: string; status: string; mime_type: string };
    const signed = row.status === "uploading" ? checked(await db.storage.from(EXAMPLE_BUCKET).createSignedUploadUrl(row.storage_path)) as { signedUrl: string } : null;
    items.push({ id: row.id, signedUrl: signed?.signedUrl ?? null, mimeType: row.mime_type, status: row.status });
  }
  return items;
}

export async function finishExampleUpload(idValue: string) {
  const id = uuid.parse(idValue);
  const db = createAccreditationAdminClient();
  const row = checked(await db.from("accreditation_examples").select("*").eq("id", id).single()) as ExampleRow;
  if (row.status !== "uploading") return;
  const blob = checked(await db.storage.from(EXAMPLE_BUCKET).download(row.storage_path)) as Blob;
  if (blob.size !== row.size_bytes || blob.size > 25 * 1024 * 1024) throw new Error("Uploaded file size does not match. Select the original file and retry.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const isPdf = row.mime_type === "application/pdf";
  let pages = 1;
  if (isPdf) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    pages = pdf.getPageCount();
    if (!pages || pages > 200) throw new Error("Use an unencrypted PDF with 1–200 pages.");
  } else if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is not a valid Office file.");
  const sha256 = hash(bytes);
  const cached = checked(await db.from("accreditation_examples").select("units,analysis,page_count").eq("sha256", sha256).eq("status", "ready").limit(1).maybeSingle()) as Pick<ExampleRow, "units" | "analysis" | "page_count"> | null;
  checked(await db.from("accreditation_examples").update({ sha256, page_count: pages, status: cached ? "ready" : "pending", ...(cached ?? {}), error: null }).eq("id", id).eq("status", "uploading"));
}

export type ExampleRow = {
  id: string; batch_id: string; family_id: string; original_name: string; mime_type: string; size_bytes: number;
  storage_path: string; status: string; units: string[]; page_count: number | null; analysis: unknown; error: string | null; retry_after: string | null;
};
export async function processExampleStep(idValue: string) {
  const id = uuid.parse(idValue);
  const db = createAccreditationAdminClient();
  return withAiGate(async () => {
    const row = checked(await db.from("accreditation_examples").select("*").eq("id", id).single()) as ExampleRow;
    if (row.status === "ready") return { ready: true };
    if (row.status === "uploading") throw new Error("Finish uploading this file first.");
    if (row.retry_after && new Date(row.retry_after).getTime() > Date.now()) throw new Error("AI capacity is recovering. Resume after the displayed retry time.");
    checked(await db.from("accreditation_examples").update({ status: "processing", error: null }).eq("id", id));
    try {
      if (row.units.length < (row.page_count ?? 1)) {
        const blob = checked(await db.storage.from(EXAMPLE_BUCKET).download(row.storage_path)) as Blob;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let content: string;
        if (row.mime_type === "application/pdf") {
          const original = await PDFDocument.load(bytes);
          const single = await PDFDocument.create();
          const [page] = await single.copyPages(original, [row.units.length]);
          single.addPage(page);
          const ocr = getAccreditationProviders().ocr;
          if (!ocr) throw new Error("PDF reading is not configured. Your file is saved.");
          const started = Date.now();
          const chunks = await ocr.extract(await single.save(), row.original_name, row.mime_type);
          console.info("accreditation_ai_operation", { operation: "example_page", model: ocr.model, durationMs: Date.now() - started });
          content = chunks.map(chunk => chunk.content).join("\n");
        } else {
          const chunks = await extractSource(bytes, row.original_name, row.mime_type, null);
          content = chunks.map(chunk => `${chunk.locator.sheet ? `Sheet: ${chunk.locator.sheet}\n` : ""}${chunk.content}`).join("\n");
        }
        checked(await db.from("accreditation_examples").update({ units: [...row.units, content], status: "pending", retry_after: null }).eq("id", id));
        return { ready: false };
      }
      const content = row.units.join("\n\n");
      if (!content.trim()) throw new Error("No readable text was found. Upload a clearer example.");
      const analysis = await analyzeDocumentExample(language(), row.original_name, content);
      checked(await db.from("accreditation_examples").update({ analysis, status: "ready", error: null, retry_after: null }).eq("id", id));
      return { ready: true };
    } catch (error) {
      const retryable = isRetryableAiError(error);
      const message = retryable ? "Gemini capacity is unavailable. Completed pages are saved; resume after the retry time." : error instanceof Error ? error.message : "Processing failed. Retry this example.";
      checked(await db.from("accreditation_examples").update({ status: "failed", error: message, retry_after: retryable ? new Date(Date.now() + aiRetrySeconds(error) * 1000).toISOString() : null }).eq("id", id));
      throw error;
    }
  });
}

export async function loadDocumentLibrary() {
  const db = createAccreditationAdminClient();
  const results = await Promise.all([
    db.from("accreditation_template_families").select("id,name,description,guidance,workflow_mode").eq("workflow_mode", "example_document").is("archived_at", null).order("created_at", { ascending: false }),
    db.from("accreditation_examples").select("id,batch_id,family_id,original_name,size_bytes,status,page_count,analysis,error,retry_after,units,accreditation_example_batches(family_id)").order("created_at", { ascending: true }),
    db.from("academic_years").select("id,label,starts_on,ends_on,academic_terms(id,label,starts_on,ends_on)").order("starts_on", { ascending: false }),
    db.from("accreditation_runs").select("id,template_family_id,title,status,cycle_id,term_id").eq("workflow_mode", "example_document").order("created_at", { ascending: false }),
    db.from("accreditation_templates").select("id,original_name,accreditation_template_families!inner(archived_at)").is("accreditation_template_families.archived_at", null).order("created_at", { ascending: false }),
    db.from("accreditation_artifacts").select("id,filename").eq("kind", "approved").order("created_at", { ascending: false }),
  ]);
  const [families, examples, years, runs, templates, approved] = results.map(checked);
  const visibleFamilyIds = new Set((families as Array<{ id: string }>).map(family => family.id));
  const visibleExamples = (examples as Array<ExampleRow & { accreditation_example_batches: { family_id: string | null } }>).filter(example => visibleFamilyIds.has(example.family_id));
  return { families, examples: visibleExamples.map(({ units, accreditation_example_batches, ...row }) => ({ ...row, uploadFamilyId: accreditation_example_batches.family_id, completedPages: units.length })), years, runs, templates, approved };
}

export async function loadDocumentWorkspace(runIdValue: string) {
  const db = createAccreditationAdminClient();
  const runId = uuid.parse(runIdValue);
  const run = checked(await db.from("accreditation_runs").select("*").eq("id", runId).eq("workflow_mode", "example_document").single()) as { id: string; title: string; status: string; template_family_id: string; cycle_id: string; term_id: string | null };
  const results = await Promise.all([
    db.from("accreditation_template_families").select("id,name,guidance").eq("id", run.template_family_id).single(),
    db.from("accreditation_run_working_state").select("document,document_version,example_ids,readiness").eq("run_id", runId).single(),
    db.from("accreditation_run_messages").select("id,role,content,created_at").eq("run_id", runId).order("created_at", { ascending: true }),
    db.from("accreditation_examples").select("id,original_name").eq("family_id", run.template_family_id).eq("status", "ready"),
    db.from("accreditation_revisions").select("id,revision_number,document_version,accreditation_artifacts(id,kind,filename)").eq("run_id", runId).order("revision_number", { ascending: false }),
    db.from("academic_years").select("label").eq("id", run.cycle_id).single(),
    run.term_id ? db.from("academic_terms").select("label").eq("id", run.term_id).single() : Promise.resolve({ data: null, error: null }),
    db.from("accreditation_document_requests").select("id,kind,payload,version,error,status,lease_until").eq("run_id", runId).neq("status", "completed").order("created_at", { ascending: false }).limit(5),
  ]);
  const [family, state, messages, examples, revisions, year, term, requests] = results.map(checked);
  return { run, family, state, messages, examples, revisions, period: (term as { label: string } | null)?.label ?? (year as { label: string }).label, requests };
}

export async function startExampleDocument(userId: string, input: unknown) {
  const value = z.object({ familyId: uuid, cycleId: uuid, termId: uuid.nullable(), exampleIds: z.array(uuid).min(1).max(30) }).parse(input);
  return checked(await createAccreditationAdminClient().rpc("accreditation_start_document", { p_family: value.familyId, p_cycle: value.cycleId, p_term: value.termId, p_user: userId, p_examples: value.exampleIds })) as string;
}

export async function renameDocumentFamily(input: unknown) {
  const value = z.object({ id: uuid, name: z.string().trim().min(1).max(160), guidance: z.string().max(5000) }).parse(input);
  const result = await createAccreditationAdminClient().from("accreditation_template_families").update({ name: value.name, guidance: value.guidance }).eq("id", value.id).eq("workflow_mode", "example_document").select("id").single();
  if (result.error?.code === "23505") throw new Error("That name is already in use. Choose a different name.");
  checked(result);
}

const requestSchema = z.object({ id: uuid, runId: uuid, kind: z.enum(["chat", "save", "pdf"]), version: z.number().int().min(0),
  payload: z.object({ message: z.string().trim().min(1).max(8000).optional(), document: accreditationDocumentSchema.optional(), exampleIds: z.array(uuid).min(1).max(30) }) });

export async function performDocumentRequest(userId: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  if (input.kind === "chat" && !input.payload.message) throw new Error("Describe the document you need.");
  if (input.kind === "save" && !input.payload.document) throw new Error("There is no document to save.");
  const db = createAccreditationAdminClient();
  const token = randomUUID();
  const request = checked(await db.rpc("accreditation_claim_document_request", { p_id: input.id, p_run: input.runId, p_kind: input.kind, p_version: input.version, p_payload: input.payload, p_user: userId, p_token: token })) as { status: string; result: unknown };
  if (request.status === "completed") return request.result;
  let uploadedPath: string | null = null;
  try {
    const workspace = await loadDocumentWorkspace(input.runId);
    const state = workspace.state as { document: unknown; readiness: Record<string, unknown> };
    const family = workspace.family as { name: string; guidance: string };
    const examples = checked(await db.from("accreditation_examples").select("*").in("id", input.payload.exampleIds).eq("family_id", workspace.run.template_family_id).eq("status", "ready")) as ExampleRow[];
    if (examples.length !== new Set(input.payload.exampleIds).size) throw new Error("One or more selected examples are not ready or belong to another document type.");
    let document = state.document ? accreditationDocumentSchema.parse(state.document) : null;
    let readiness = state.readiness;
    let result: Record<string, unknown> = {};
    if (input.kind === "save") document = input.payload.document!;
    if (input.kind === "chat") {
      const provider = language();
      const response = await withAiGate(() => draftExampleDocument(provider, { name: family.name, guidance: family.guidance, period: workspace.period,
        message: input.payload.message!, document,
        examples: examples.map(example => ({ id: example.id, name: example.original_name, content: example.units.join("\n\n"), analysis: exampleAnalysisSchema.parse(example.analysis) })),
        history: (workspace.messages as Array<{ role: string; content: string }>).slice(0, -1),
      }));
      document = response.document ?? document;
      readiness = { questions: response.questions, reviewNotes: response.reviewNotes, model: provider.model,
        sources: examples.map(example => ({ id: example.id, name: example.original_name })), validation: response.reviewNotes.map(message => ({ level: "warning", message })) };
      result = { answer: response.answer };
    }
    if (document) for (const block of document.blocks) if (block.type === "table") documentTableTotals(block);
    if (input.kind === "pdf") {
      if (!document) throw new Error("Create a draft first.");
      const bytes = renderAccreditationDocument(document);
      const revisionId = randomUUID();
      const filename = `${document.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 90)}-draft-v${input.version}.pdf`;
      const path = `${workspace.run.cycle_id}/${input.runId}/${revisionId}/draft/${filename}`;
      checked(await db.storage.from("accreditation-artifacts").upload(path, bytes, { contentType: "application/pdf" }));
      uploadedPath = path;
      result = { revisionId, artifactId: randomUUID(), path, filename, size: bytes.byteLength, sha256: hash(bytes), version: input.version };
    }
    const saved = checked(await db.rpc("accreditation_finish_document_request", { p_id: input.id, p_token: token, p_document: document, p_readiness: readiness, p_result: result }));
    return saved;
  } catch (error) {
    // A response can be lost after the transaction committed. Never remove that PDF.
    const existing = await db.from("accreditation_document_requests").select("status,result").eq("id", input.id).single();
    if (existing.data?.status === "completed") return existing.data.result;
    if (uploadedPath && !existing.error) await db.storage.from("accreditation-artifacts").remove([uploadedPath]);
    const message = isRetryableAiError(error) ? "Gemini capacity is unavailable. Your message and draft are saved. Retry in a minute." : error instanceof Error ? error.message : "This operation failed. Your previous draft is saved.";
    await db.from("accreditation_document_requests").update({ status: "failed", error: message, lease_until: null }).eq("id", input.id).eq("lease_token", token).neq("status", "completed");
    console.warn("accreditation_document_error", { operation: input.kind, category: isRetryableAiError(error) ? "capacity" : "operation" });
    throw new Error(message);
  }
}

export async function seedDocumentExample(userId: string, input: unknown) {
  const value = z.object({ id: uuid, sourceId: uuid, source: z.enum(["template", "approved", "example"]) }).parse(input);
  const db = createAccreditationAdminClient();
  let path: string; let name: string; let bucket: string;
  if (value.source === "template") {
    const row = checked(await db.from("accreditation_templates").select("storage_path,original_name,example_storage_path,example_original_name").eq("id", value.sourceId).single()) as { storage_path: string; original_name: string; example_storage_path: string | null; example_original_name: string | null };
    path = row.example_storage_path ?? row.storage_path; name = row.example_original_name ?? row.original_name; bucket = "accreditation-templates";
  } else if (value.source === "approved") {
    const row = checked(await db.from("accreditation_artifacts").select("storage_path,filename").eq("id", value.sourceId).eq("kind", "approved").single()) as { storage_path: string; filename: string };
    path = row.storage_path; name = row.filename; bucket = "accreditation-artifacts";
  } else {
    const row = checked(await db.from("accreditation_examples").select("storage_path,original_name").eq("id", value.sourceId).single()) as { storage_path: string; original_name: string };
    path = row.storage_path; name = row.original_name; bucket = EXAMPLE_BUCKET;
  }
  const blob = checked(await db.storage.from(bucket).download(path)) as Blob;
  const reserved = await reserveExampleBatch(userId, { id: value.id, familyId: null, files: [{ id: value.id, name, size: blob.size }] });
  if (reserved[0].status === "uploading") {
    const target = checked(await db.from("accreditation_examples").select("storage_path").eq("id", value.id).single()) as { storage_path: string };
    const upload = await db.storage.from(EXAMPLE_BUCKET).upload(target.storage_path, blob, { contentType: reserved[0].mimeType });
    if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error(upload.error.message);
    await finishExampleUpload(value.id);
  }
  return value.id;
}
