import "server-only";
import { extractSource } from "./extract";
import { getAccreditationProviders } from "./providers";
import { createAccreditationAdminClient } from "./supabase";
import type { ExtractedChunk } from "./types";

export async function processDocument(sourceId: string, policy = false, signatureFree = false) {
  const db = createAccreditationAdminClient();
  const table = policy ? "policy_documents" : "accreditation_sources";
  const chunkTable = policy ? "policy_chunks" : "accreditation_source_chunks";
  const checkpointTable = policy ? "policy_embedding_checkpoints" : "accreditation_embedding_checkpoints";
  const source = await db.from(table).select("*").eq("id", sourceId).single();
  if (source.error || !source.data || ["archived", "published", "superseded"].includes(source.data.status)) throw new Error("This source cannot be processed.");
  try {
    const providers = getAccreditationProviders();
    if (!providers.embeddings) throw new Error("Configure the server AI credentials before processing sources.");
    const existing = await db.from(chunkTable).select("ordinal, content, locator, embedding_profile, embedding_v2").eq("source_id", sourceId).order("ordinal");
    if (existing.error) throw new Error("Existing source text could not be loaded.");
    if (source.data.active_embedding_profile === providers.embeddings.profile && existing.data?.length && existing.data.every((c: { embedding_profile: string; embedding_v2: unknown }) => c.embedding_profile === providers.embeddings!.profile && c.embedding_v2)) return;
    // Existing extraction is reused so re-embedding preserves citation ordinals.
    let chunks = (existing.data ?? []) as ExtractedChunk[];
    if (!signatureFree) throw new Error("Confirm this source and its extracted text contain no signatures before sending them to AI.");
    const checkpoints = await db.from(checkpointTable).select("ordinal").eq("source_id", sourceId).eq("embedding_profile", providers.embeddings.profile);
    if (checkpoints.error) throw new Error("Saved embedding progress could not be loaded.");
    const completedOrdinals = new Set((checkpoints.data ?? []).map((checkpoint: { ordinal: number }) => checkpoint.ordinal));
    const started = await db.from(table).update(policy
      ? { status: "draft", processing_state: "processing", processing_error: null, processing_total: chunks.length, processing_completed: completedOrdinals.size, processing_attempts: Number(source.data.processing_attempts ?? 0) + 1 }
      : { status: "processing", processing_error: null, processing_total: chunks.length, processing_completed: completedOrdinals.size, processing_attempts: Number(source.data.processing_attempts ?? 0) + 1 })
      .eq("id", sourceId).in("status", policy ? ["draft", "failed"] : ["ready", "processing", "failed"]).select("id");
    if (started.error || !started.data?.length) throw new Error("Source is no longer available for processing.");
    if (!chunks.length) {
      const file = await db.storage.from(policy ? "policy-documents" : "accreditation-sources").download(source.data.storage_path);
      if (file.error || !file.data) throw new Error("Source file could not be loaded.");
      chunks = await extractSource(new Uint8Array(await file.data.arrayBuffer()), source.data.original_name, source.data.mime_type, providers.ocr);
    }
    if (!chunks.length) throw new Error("No readable text was found.");
    if (!existing.data?.length) {
      const saved = await db.rpc("checkpoint_document_chunks", { p_source: sourceId, p_policy: policy, p_chunks: chunks });
      if (saved.error) throw new Error(saved.error.message);
    }
    const progressStarted = await db.from(table).update({ processing_total: chunks.length, processing_completed: completedOrdinals.size }).eq("id", sourceId);
    if (progressStarted.error) throw new Error("Document progress could not be initialized.");
    for (const chunk of chunks) {
      if (completedOrdinals.has(chunk.ordinal)) continue;
      const [vector] = await providers.embeddings.embedDocuments([chunk.content], policy ? source.data.title : source.data.original_name);
      if (!vector) throw new Error(`Passage ${chunk.ordinal + 1} did not receive an embedding.`);
      const checkpoint = await db.rpc("checkpoint_document_embedding", {
        p_source: sourceId,
        p_policy: policy,
        p_profile: providers.embeddings.profile,
        p_ordinal: chunk.ordinal,
        p_embedding: vector,
        p_provider: providers.embeddings.name,
        p_model: providers.embeddings.model,
      });
      if (checkpoint.error) throw new Error(checkpoint.error.message);
      completedOrdinals.add(chunk.ordinal);
    }
    const activated = await db.rpc("activate_document_embeddings", { p_source: sourceId, p_policy: policy, p_profile: providers.embeddings.profile });
    if (activated.error) throw new Error(activated.error.message);
  } catch (error) {
    // Keep an already-ready legacy source intact when a migration attempt fails.
    const message = error instanceof Error ? error.message.slice(0, 500) : "Processing failed. Retry later.";
    await db.from(table).update(policy ? { processing_state: "failed", status: "failed", processing_error: message } : { status: source.data.status === "ready" ? "ready" : "failed", processing_error: message }).eq("id", sourceId).in("status", policy ? ["draft", "failed"] : ["ready", "processing", "failed"]);
    throw error;
  }
}
