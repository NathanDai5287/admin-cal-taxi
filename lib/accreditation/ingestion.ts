import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { createAccreditationAdminClient } from "./supabase";
import { getAccreditationProviders } from "./providers";
import { chunkText, extractSource } from "./extract";
import { readPdfPage } from "./pdf-text";
import { ingestionFailure } from "./ingestion-errors";

export const ingestionEnabled = () => process.env.DOCUMENT_INGESTION_ENABLED === "true";
const hash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
// These additive tables are intentionally outside the legacy generated DB type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checked(result: { data: any; error: { message: string } | null }): any {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function enqueueDocument(sourceId: string, policy: boolean, signatureFree: boolean) {
  if (!signatureFree) throw new Error("Confirm this source and its text contain no signatures.");
  const db = createAccreditationAdminClient();
  const source = checked(await db.from(policy ? "policy_documents" : "accreditation_sources").select("*").eq("id", sourceId).single());
  const providers = getAccreditationProviders();
  const embedding = providers.embeddings;
  if (!embedding) throw new Error("Embeddings are not configured.");
  const config = {
    hash: source.content_hash ?? source.sha256,
    title: policy ? source.title : source.original_name,
    extraction: "native-first-v1", chunking: "page-3200-v1",
    ocr: providers.ocr?.model ?? null,
    profile: embedding.profile, model: embedding.model, provider: embedding.name, dimensions: embedding.dimensions,
  };
  return checked(await db.rpc("ingestion_enqueue", { p_source: sourceId, p_policy: policy, p_config: config }));
}

export async function runIngestionWorker() {
  const db = createAccreditationAdminClient();
  const runnerToken = randomUUID();
  if (!checked(await db.rpc("ingestion_gate", { p_model: "queue-drain", p_token: runnerToken }))) return;
  const started = Date.now();
  try {
    while (Date.now() - started < 20_000) {
      const token = randomUUID();
      const job = checked(await db.rpc("ingestion_claim", { p_token: token }))?.[0];
      if (!job) break;
      const commit = async (kind: string, data: unknown) => checked(await db.rpc("ingestion_commit", { p_job: job.id, p_token: token, p_kind: kind, p_data: data }));
      let gate: string | null = null;
      let cooldown = 0;
      try {
        const policy = !!job.policy_id;
        const sourceId = job.policy_id ?? job.evidence_id;
        const source = checked(await db.from(policy ? "policy_documents" : "accreditation_sources").select("*").eq("id", sourceId).single());
        const providers = getAccreditationProviders({ singleAttempt: true });
        if (!providers.embeddings || providers.embeddings.profile !== job.config.profile || providers.ocr?.model !== job.config.ocr) throw new Error("Processing configuration changed; restore the previous model settings to resume.");
        const requestHash = (content: string) => hash(JSON.stringify({ config: job.config, content }));
        const reserve = async (model: string, seconds: number) => {
          const key = `${providers.embeddings!.name}:${model}`;
          if (!checked(await db.rpc("ingestion_gate", { p_model: key, p_token: token }))) return false;
          gate = key; cooldown = seconds; return true;
        };
        if (job.stage === "validation") {
          const chunks = checked(await db.from(policy ? "policy_chunks" : "accreditation_source_chunks").select("ordinal,content,locator,embedding_v2,embedding_profile").eq("source_id", sourceId).order("ordinal"));
          if (chunks.length) {
            const checkpoints = checked(await db.from(policy ? "policy_embedding_checkpoints" : "accreditation_embedding_checkpoints").select("ordinal,embedding").eq("source_id", sourceId).eq("embedding_profile", job.config.profile));
            await commit("chunks", chunks.map((c: { ordinal: number; content: string; locator: unknown; embedding_v2: unknown; embedding_profile: string }) => {
              const vector = c.embedding_profile === job.config.profile ? c.embedding_v2 : checkpoints.find((p: { ordinal: number }) => p.ordinal === c.ordinal)?.embedding;
              return { ...c, request_hash: requestHash(c.content), embedding: typeof vector === "string" ? JSON.parse(vector) : vector ?? undefined };
            }));
          } else {
            const file = checked(await db.storage.from(policy ? "policy-documents" : "accreditation-sources").download(source.storage_path));
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (bytes.length > 25 * 1024 * 1024) throw new Error("File exceeds 25 MB.");
            if (job.config.hash && hash(bytes) !== job.config.hash) throw new Error("Source content changed.");
            const pdf = source.original_name.toLowerCase().endsWith(".pdf");
            if (pdf) await commit("validated", { pages: (await PDFDocument.load(bytes)).getPageCount() });
            else {
              const chunks = await extractSource(bytes, source.original_name, source.mime_type, null);
              await commit("chunks", chunks.map(c => ({ ...c, request_hash: requestHash(c.content) })));
            }
          }
        } else if (job.stage === "extraction") {
          const pages = checked(await db.from("document_ingestion_pages").select("page").eq("job_id", job.id));
          const page = Array.from({ length: job.page_count }, (_, i) => i + 1).find(n => !pages.some((p: { page: number }) => p.page === n));
          if (!page) throw new Error("Extraction checkpoints are inconsistent.");
          const file = checked(await db.storage.from(policy ? "policy-documents" : "accreditation-sources").download(source.storage_path));
          const bytes = new Uint8Array(await file.arrayBuffer());
          const extracted = await readPdfPage(bytes, page);
          let text = extracted.text;
          if (extracted.method === "ocr" || job.config.force_page === page) {
            if (!providers.ocr) throw new Error("PDF reading is not configured.");
            if (!await reserve(providers.ocr.model, Math.max(1, Number(process.env.INGESTION_OCR_INTERVAL_SECONDS) || 10))) {
              await commit("wait", { retry_at: new Date(Date.now() + 10_000).toISOString() }); continue;
            }
            const original = await PDFDocument.load(bytes);
            const single = await PDFDocument.create();
            const [copied] = await single.copyPages(original, [page - 1]); single.addPage(copied);
            text = (await providers.ocr.extract(await single.save(), source.original_name, "application/pdf")).map(c => c.content).join("\n");
            if (!text.trim()) throw new Error("AI returned no text for a nonblank page; review this page.");
          }
          await commit("page", { page, text, method: job.config.force_page === page ? "ocr" : extracted.method });
        } else if (job.stage === "chunking") {
          const pages = checked(await db.from("document_ingestion_pages").select("page,text").eq("job_id", job.id).order("page"));
          const chunks = pages.flatMap((p: { page: number; text: string }) => chunkText(p.text, { page: p.page }));
          await commit("chunks", chunks.map((c: { content: string; locator: unknown }, ordinal: number) => ({ ...c, ordinal, request_hash: requestHash(c.content) })));
        } else if (job.stage === "embedding") {
          const chunk = checked(await db.from("document_ingestion_chunks").select("*").eq("job_id", job.id).is("embedding", null).order("ordinal").limit(1))?.[0];
          if (!chunk) await commit("activate", {});
          else if (!await reserve(providers.embeddings.model, Math.max(1, Number(process.env.INGESTION_EMBED_INTERVAL_SECONDS) || 2))) await commit("wait", { retry_at: new Date(Date.now() + 2_000).toISOString() });
          else {
            const [vector] = await providers.embeddings.embedDocuments([chunk.content], job.config.title);
            await commit("embedding", { ordinal: chunk.ordinal, request_hash: chunk.request_hash, embedding: vector });
          }
        }
        console.info("document_ingestion", { jobId: job.id, stage: job.stage, durationMs: Date.now() - started });
      } catch (error) {
        const failures = job.failures + 1;
        const failure = ingestionFailure(error, failures);
        cooldown = Math.max(cooldown, failure.seconds);
        await commit("wait", { status: failure.status, failures, retry_at: new Date(Date.now() + cooldown * 1000).toISOString(), error: { message: failure.message, retryable: failure.retryable, stage: job.stage } }).catch(() => {});
        console.warn("document_ingestion_failed", { jobId: job.id, stage: job.stage, retryable: failure.retryable, failures });
      } finally {
        if (gate) await db.rpc("ingestion_gate", { p_model: gate, p_token: token, p_seconds: cooldown });
      }
    }
  } finally { await db.rpc("ingestion_gate", { p_model: "queue-drain", p_token: runnerToken, p_seconds: 0 }); }
}
