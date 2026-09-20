"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getReportDefinition } from "@/lib/accreditation/definitions";
import type { BatchCreateResult, BatchProcessResult } from "@/lib/accreditation/batch";
import { validateSourceFile } from "@/lib/accreditation/extract";
import { isRetryableAiError } from "@/lib/accreditation/gemini";
import { processDocument } from "@/lib/accreditation/processing";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { findVisibleTemplateTags, inspectTemplate, renderTemplate, validateTemplateFile } from "@/lib/accreditation/templates";
import { analyzeTemplateWithAi, mappingFromAnalysis } from "@/lib/accreditation/template-ai";
import { getAccreditationProviders } from "@/lib/accreditation/providers";
import { extractSource } from "@/lib/accreditation/extract";
import { REPORT_KEYS, type ReportDraft, type SourceKind, type TemplateMapping } from "@/lib/accreditation/types";
import { buildDraft } from "@/lib/accreditation/workflow";
import { requireAdmin } from "@/lib/reimbursements/auth";

async function requireAccreditationAdmin() {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  return requireAdmin();
}

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceKinds = ["official_guideline", "blank_template", "prior_submission", "chapter_evidence"] as const;

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";
}

function fileMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  return ({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

function reportPath(runId: string, result?: string) {
  return `/accreditation/reports/${runId}${result ? `?result=${encodeURIComponent(result)}` : ""}`;
}

export async function createCycle(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const parsed = z.object({
    label: z.string().trim().min(4).max(40),
    fallStart: isoDate,
    fallEnd: isoDate,
    springStart: isoDate,
    springEnd: isoDate,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/accreditation?result=invalid_cycle");
  const values = parsed.data;
  if (values.fallEnd < values.fallStart || values.springEnd < values.springStart || values.springStart <= values.fallEnd) {
    redirect("/accreditation?result=invalid_cycle");
  }
  const supabase = createAccreditationAdminClient();
  const cycleId = crypto.randomUUID();
  const cycle = await supabase.from("accreditation_cycles").insert({
    id: cycleId,
    label: values.label,
    starts_on: values.fallStart,
    ends_on: values.springEnd,
    created_by: userId,
  });
  if (cycle.error) redirect("/accreditation?result=cycle_error");
  const terms = await supabase.from("accreditation_terms").insert([
    { cycle_id: cycleId, season: "fall", label: `Fall ${values.label}`, starts_on: values.fallStart, ends_on: values.fallEnd },
    { cycle_id: cycleId, season: "spring", label: `Spring ${values.label}`, starts_on: values.springStart, ends_on: values.springEnd },
  ]);
  if (terms.error) {
    await supabase.from("accreditation_cycles").delete().eq("id", cycleId);
    redirect("/accreditation?result=cycle_error");
  }
  revalidatePath("/accreditation", "layout");
  redirect(`/accreditation?cycle=${cycleId}&result=cycle_created`);
}

export async function uploadSource(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const cycleId = uuid.safeParse(formData.get("cycleId"));
  const termValue = String(formData.get("termId") ?? "");
  const termId = termValue ? uuid.safeParse(termValue) : null;
  const kind = z.enum(sourceKinds).safeParse(formData.get("kind"));
  const reportValue = String(formData.get("reportKey") ?? "");
  const reportKey = reportValue ? z.enum(REPORT_KEYS).safeParse(reportValue) : null;
  const file = formData.get("file");
  if (!cycleId.success || !kind.success || (termId && !termId.success) || (reportKey && !reportKey.success) || !(file instanceof File)) {
    redirect("/accreditation/library?result=invalid");
  }
  try {
    validateSourceFile(file);
  } catch {
    redirect(`/accreditation/library?cycle=${cycleId.data}&result=invalid_file`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = sha256(bytes);
  const supabase = createAccreditationAdminClient();
  const duplicate = await supabase.from("accreditation_sources").select("id").eq("cycle_id", cycleId.data).eq("sha256", digest).maybeSingle();
  if (duplicate.data) redirect(`/accreditation/library?cycle=${cycleId.data}&result=duplicate`);
  const sourceId = crypto.randomUUID();
  const storagePath = `${cycleId.data}/${sourceId}/${safeName(file.name)}`;
  const mimeType = fileMimeType(file);
  const upload = await supabase.storage.from("accreditation-sources").upload(storagePath, bytes, { contentType: mimeType });
  if (upload.error) redirect(`/accreditation/library?cycle=${cycleId.data}&result=upload_error`);
  const inserted = await supabase.from("accreditation_sources").insert({
    id: sourceId,
    cycle_id: cycleId.data,
    term_id: termId?.success ? termId.data : null,
    report_key: reportKey?.success ? reportKey.data : null,
    kind: kind.data as SourceKind,
    status: "processing",
    original_name: file.name,
    mime_type: mimeType,
    size_bytes: file.size,
    sha256: digest,
    storage_path: storagePath,
    created_by: userId,
  });
  if (inserted.error) {
    await supabase.storage.from("accreditation-sources").remove([storagePath]);
    redirect(`/accreditation/library?cycle=${cycleId.data}&result=upload_error`);
  }
  try {
    await processDocument(sourceId, false, true);
    revalidatePath("/accreditation", "layout");
    redirect(`/accreditation/library?cycle=${cycleId.data}&result=uploaded`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    await supabase.from("accreditation_sources").update({
      status: "failed",
      processing_error: error instanceof Error ? error.message.slice(0, 500) : "Source processing failed.",
    }).eq("id", sourceId);
    revalidatePath("/accreditation/library");
    redirect(`/accreditation/library?cycle=${cycleId.data}&result=processing_failed`);
  }
}

function serviceErrorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "");
  const row = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown; statusCode?: unknown };
  return [row.code, row.statusCode, row.message, row.details, row.hint].filter(Boolean).join(" ");
}

function templateAnalysisResult(error: unknown) {
  const message = error instanceof Error ? error.message : serviceErrorText(error);
  if (isRetryableAiError(error)) return "template_ai_temporarily_unavailable";
  if (/language-model provider|server AI credentials|api key/i.test(message)) return "template_ai_not_configured";
  if (/PDF extraction requires|OCR provider/i.test(message)) return "template_ocr_not_configured";
  if (/encrypted|PDF signature is invalid/i.test(message)) return "template_pdf_invalid_or_encrypted";
  if (/safe processing limit|limited to 200 pages/i.test(message)) return "template_too_complex";
  if (/malformed|Invalid structured response|Invalid structure/i.test(message)) return "template_ai_response_invalid";
  return "template_analysis_failed";
}

function templateStorageResult(error: unknown, fallback = "template_storage_failed") {
  const message = serviceErrorText(error);
  if (/bucket.*not found|not found.*bucket/i.test(message)) return "template_storage_not_configured";
  if (/row.level|unauthorized|forbidden|permission|42501/i.test(message)) return "template_storage_permission_denied";
  if (/payload|too large|maximum|size/i.test(message)) return "template_file_too_large";
  return fallback;
}

function templateRecordResult(error: unknown) {
  const message = serviceErrorText(error);
  if (/PGRST204|schema cache|analysis_status|example_storage_path|preview_storage_path/i.test(message)) return "template_database_update_required";
  if (/23505|duplicate key|unique constraint/i.test(message)) return "template_version_conflict";
  if (/row.level|permission|42501/i.test(message)) return "template_database_permission_denied";
  return "template_record_failed";
}

export async function createAccreditationBatchItem(formData: FormData): Promise<BatchCreateResult> {
  const { userId } = await requireAccreditationAdmin();
  const cycleId = uuid.safeParse(formData.get("cycleId"));
  const termValue = String(formData.get("termId") ?? "");
  const termId = termValue ? uuid.safeParse(termValue) : null;
  const kind = z.enum(sourceKinds).safeParse(formData.get("kind"));
  const reportValue = String(formData.get("reportKey") ?? "");
  const reportKey = reportValue ? z.enum(REPORT_KEYS).safeParse(reportValue) : null;
  const file = formData.get("file");
  if (!cycleId.success || !kind.success || (termId && !termId.success) || (reportKey && !reportKey.success) || !(file instanceof File)) {
    return { ok: false, message: "Choose valid evidence metadata and a document." };
  }
  if (formData.get("signatureFree") !== "on") return { ok: false, message: "Confirm signatures and unnecessary personal information were removed." };
  try { validateSourceFile(file); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Use a supported document up to 25 MB." }; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = sha256(bytes);
  const db = createAccreditationAdminClient();
  const duplicate = await db.from("accreditation_sources").select("id").eq("cycle_id", cycleId.data).eq("sha256", digest).maybeSingle();
  if (duplicate.data) return { ok: false, id: duplicate.data.id, message: "This document is already in the selected academic year." };
  const id = crypto.randomUUID();
  const storagePath = `${cycleId.data}/${id}/${safeName(file.name)}`;
  const mimeType = fileMimeType(file);
  const upload = await db.storage.from("accreditation-sources").upload(storagePath, bytes, { contentType: mimeType });
  if (upload.error) return { ok: false, message: "Upload failed. Please retry this document." };
  const inserted = await db.from("accreditation_sources").insert({
    id,
    cycle_id: cycleId.data,
    term_id: termId?.success ? termId.data : null,
    report_key: reportKey?.success ? reportKey.data : null,
    kind: kind.data as SourceKind,
    status: "processing",
    original_name: file.name,
    mime_type: mimeType,
    size_bytes: file.size,
    sha256: digest,
    storage_path: storagePath,
    created_by: userId,
  });
  if (inserted.error) {
    await db.storage.from("accreditation-sources").remove([storagePath]);
    return { ok: false, message: "Evidence could not be saved." };
  }
  revalidatePath("/accreditation/library");
  return { ok: true, id, message: "Uploaded. Waiting to embed." };
}

export async function processAccreditationBatchItem(idValue: string): Promise<BatchProcessResult> {
  await requireAccreditationAdmin();
  const id = uuid.safeParse(idValue);
  if (!id.success) return { ok: false, retryable: false, message: "The uploaded evidence ID is invalid." };
  try {
    await processDocument(id.data, false, true);
    revalidatePath("/accreditation/library");
    return { ok: true, retryable: false, message: "Embedding complete." };
  } catch (error) {
    revalidatePath("/accreditation/library");
    const retryable = isRetryableAiError(error);
    return { ok: false, retryable, message: retryable ? "Gemini is rate-limited or overloaded." : "Processing failed. Review the document error." };
  }
}

export async function reprocessSource(formData: FormData) {
  await requireAccreditationAdmin();
  const id = uuid.parse(formData.get("sourceId"));
  try {
    await processDocument(id, false, formData.get("signatureFree") === "on");
  } catch {
    revalidatePath("/accreditation/library");
    redirect("/accreditation/library?result=processing_failed_check_source_error");
  }
  revalidatePath("/accreditation/library");
  redirect("/accreditation/library?result=reembedded");
}

export async function archiveSource(formData: FormData) {
  await requireAccreditationAdmin();
  const sourceId = uuid.safeParse(formData.get("sourceId"));
  if (!sourceId.success) return;
  await createAccreditationAdminClient().from("accreditation_sources").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", sourceId.data);
  revalidatePath("/accreditation/library");
}

export async function deleteSource(formData: FormData) {
  await requireAccreditationAdmin();
  const sourceId = uuid.safeParse(formData.get("sourceId"));
  if (!sourceId.success || formData.get("confirmDelete") !== "on") redirect("/accreditation/library?result=confirm_deletion");
  const db = createAccreditationAdminClient();
  const source = await db.from("accreditation_sources").select("cycle_id,storage_path").eq("id", sourceId.data).maybeSingle();
  if (!source.data) redirect("/accreditation/library?result=source_not_found");
  const removed = await db.from("accreditation_sources").delete().eq("id", sourceId.data).select("id");
  if (removed.error || !removed.data?.length) {
    redirect(`/accreditation/library?cycle=${source.data.cycle_id}&result=source_is_in_use_archive_instead`);
  }
  const storage = await db.storage.from("accreditation-sources").remove([source.data.storage_path]);
  revalidatePath("/accreditation", "layout");
  redirect(`/accreditation/library?cycle=${source.data.cycle_id}&result=${storage.error ? "document_and_embeddings_deleted_storage_cleanup_failed" : "document_and_embeddings_deleted"}`);
}

export async function uploadTemplate(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const reportKey = z.enum(REPORT_KEYS).safeParse(formData.get("reportKey"));
  const file = formData.get("file");
  const example = formData.get("example");
  const exampleFile = example instanceof File && example.size > 0 ? example : null;
  if (!reportKey.success || !(file instanceof File)) redirect("/accreditation/templates?result=invalid");
  let format;
  try {
    format = validateTemplateFile(file);
  } catch {
    redirect("/accreditation/templates?result=invalid_file");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (exampleFile) {
    let exampleFormat;
    try { exampleFormat = validateTemplateFile(exampleFile); } catch { redirect("/accreditation/templates?result=invalid_example"); }
    if (exampleFormat !== format) redirect("/accreditation/templates?result=example_format_mismatch");
  }
  let inspection;
  try {
    inspection = await inspectTemplate(bytes, format);
  } catch {
    redirect("/accreditation/templates?result=invalid_file");
  }
  const providers = getAccreditationProviders();
  if (format === "pdf" && providers.ocr?.extractLayout) {
    try {
      const blocks = await providers.ocr.extractLayout(bytes, file.name, fileMimeType(file));
      const tags: string[] = [...(inspection.tags ?? [])];
      for (const block of blocks) {
        for (const tag of findVisibleTemplateTags(block.text)) {
          tags.push(tag);
          const key = tag.replace(/\s+/g, "_").toLowerCase();
          inspection.candidates[key] = { page: block.page, normalizedX: block.x, normalizedY: block.y, normalizedWidth: block.width, normalizedHeight: block.height };
        }
      }
      inspection.tags = [...new Set(tags)];
      inspection.inventory = `${inspection.inventory ?? ""}\nOCR layout:\n${blocks.map((block) => `Page ${block.page} (${block.x},${block.y},${block.width},${block.height}): ${block.text}`).join("\n")}`;
    } catch (error) {
      console.warn("PDF layout OCR unavailable; continuing with native PDF fields", error);
    }
  }
  let analysis;
  try {
    const templateChunks = await extractSource(bytes, file.name, fileMimeType(file), providers.ocr);
    let exampleChunks: Awaited<ReturnType<typeof extractSource>> = [];
    if (exampleFile) {
      const exampleBytes = new Uint8Array(await exampleFile.arrayBuffer());
      exampleChunks = await extractSource(exampleBytes, exampleFile.name, fileMimeType(exampleFile), providers.ocr);
    }
    analysis = await analyzeTemplateWithAi({
      definition: getReportDefinition(reportKey.data)!,
      format,
      inspection,
      templateText: templateChunks.map((chunk) => chunk.content).join("\n\n"),
      exampleText: exampleChunks.map((chunk) => chunk.content).join("\n\n"),
    });
  } catch (error) {
    console.error("Accreditation template analysis failed", error);
    redirect(`/accreditation/templates?result=${templateAnalysisResult(error)}`);
  }
  const supabase = createAccreditationAdminClient();
  const versions = await supabase.from("accreditation_templates").select("version").eq("report_key", reportKey.data).order("version", { ascending: false }).limit(1);
  if (versions.error) {
    console.error("Accreditation template version lookup failed", versions.error);
    redirect(`/accreditation/templates?result=${templateRecordResult(versions.error)}`);
  }
  const version = Number(versions.data?.[0]?.version ?? 0) + 1;
  const templateId = crypto.randomUUID();
  const path = `${reportKey.data}/${templateId}/${safeName(file.name)}`;
  const mimeType = fileMimeType(file);
  const uploaded = await supabase.storage.from("accreditation-templates").upload(path, bytes, { contentType: mimeType });
  if (uploaded.error) {
    console.error("Accreditation template original upload failed", uploaded.error);
    redirect(`/accreditation/templates?result=${templateStorageResult(uploaded.error)}`);
  }
  const mapping = mappingFromAnalysis(analysis);
  let examplePath: string | null = null;
  if (exampleFile) {
    examplePath = `${reportKey.data}/${templateId}/example-${safeName(exampleFile.name)}`;
    const exampleUpload = await supabase.storage.from("accreditation-templates").upload(examplePath, new Uint8Array(await exampleFile.arrayBuffer()), { contentType: fileMimeType(exampleFile) });
    if (exampleUpload.error) {
      await supabase.storage.from("accreditation-templates").remove([path]);
      console.error("Accreditation template example upload failed", exampleUpload.error);
      redirect(`/accreditation/templates?result=${templateStorageResult(exampleUpload.error, "template_example_storage_failed")}`);
    }
  }
  const definition = getReportDefinition(reportKey.data)!;
  const sampleDraft: ReportDraft = { fields: Object.fromEntries(definition.fields.map((field) => [field.key, {
    value: field.lockedBlank ? "" : `Sample ${field.label}`,
    provenance: "user_input" as const,
    citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true,
  }])) };
  let previewPath: string | null = null;
  let previewFailure = "template_preview_render_failed";
  try {
    const rendered = await renderTemplate(bytes, format, mapping, sampleDraft);
    previewPath = `${reportKey.data}/${templateId}/preview.${rendered.extension}`;
    previewFailure = "template_preview_storage_failed";
    const previewUpload = await supabase.storage.from("accreditation-templates").upload(previewPath, rendered.bytes, { contentType: rendered.mimeType });
    if (previewUpload.error) throw previewUpload.error;
  } catch (error) {
    if (examplePath) await supabase.storage.from("accreditation-templates").remove([examplePath]);
    await supabase.storage.from("accreditation-templates").remove([path]);
    console.error("Accreditation template preview failed", error);
    redirect(`/accreditation/templates?result=${previewFailure}`);
  }
  const inserted = await supabase.from("accreditation_templates").insert({
    id: templateId,
    report_key: reportKey.data,
    version,
    format,
    original_name: file.name,
    mime_type: mimeType,
    storage_path: path,
    sha256: sha256(bytes),
    mapping,
    analysis_status: "needs_review",
    analysis,
    example_storage_path: examplePath,
    example_original_name: exampleFile?.name ?? null,
    preview_storage_path: previewPath,
    is_active: false,
    created_by: userId,
  });
  if (inserted.error) {
    await supabase.storage.from("accreditation-templates").remove([path, ...(examplePath ? [examplePath] : []), ...(previewPath ? [previewPath] : [])]);
    console.error("Accreditation template record insert failed", inserted.error);
    redirect(`/accreditation/templates?result=${templateRecordResult(inserted.error)}`);
  }
  revalidatePath("/accreditation/templates");
  redirect(`/accreditation/templates?template=${templateId}&result=template_uploaded`);
}

export async function confirmTemplate(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const templateId = uuid.safeParse(formData.get("templateId"));
  if (!templateId.success) redirect("/accreditation/templates?result=invalid_mapping");
  const supabase = createAccreditationAdminClient();
  const template = await supabase.from("accreditation_templates").select("report_key, format, mapping, storage_path, analysis_status, analysis").eq("id", templateId.data).single();
  if (template.error) redirect("/accreditation/templates?result=invalid_mapping");
  const definition = getReportDefinition(template.data.report_key);
  if (!definition) redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  if (template.data.analysis_status !== "needs_review") redirect(`/accreditation/templates?template=${templateId.data}&result=analysis_not_ready`);
  const mapping: TemplateMapping = (template.data.mapping ?? {}) as TemplateMapping;
  const analyzedFields = Array.isArray((template.data.analysis as Record<string, unknown> | null)?.fields) ? (template.data.analysis as { fields: Array<{ key?: unknown; required?: unknown }> }).fields : [];
  const requiredKeys = analyzedFields.length ? analyzedFields.filter((field) => field.required && typeof field.key === "string").map((field) => String(field.key)) : definition.fields.filter((field) => field.required).map((field) => field.key);
  const missingRequired = requiredKeys.some((key) => !mapping[key]);
  if (missingRequired) {
    redirect(`/accreditation/templates?template=${templateId.data}&result=analysis_incomplete`);
  }
  const storedFile = await supabase.storage.from("accreditation-templates").download(template.data.storage_path);
  if (storedFile.error) redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  const sampleDraft: ReportDraft = { fields: Object.fromEntries(definition.fields.map((field) => [field.key, {
    value: field.lockedBlank ? "" : `Sample ${field.label}`, provenance: "user_input" as const, citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true,
  }])) };
  try {
    await renderTemplate(new Uint8Array(await storedFile.data.arrayBuffer()), template.data.format, mapping, sampleDraft);
  } catch {
    redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  }
  await supabase.from("accreditation_templates").update({ is_active: false }).eq("report_key", template.data.report_key);
  const updated = await supabase.from("accreditation_templates").update({
    mapping,
    is_active: true,
    analysis_status: "active",
    confirmed_at: new Date().toISOString(),
    confirmed_by: userId,
  }).eq("id", templateId.data);
  if (updated.error) redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  revalidatePath("/accreditation", "layout");
  redirect(`/accreditation/templates?template=${templateId.data}&result=template_confirmed`);
}

export async function updateReportGuidance(formData: FormData) {
  await requireAccreditationAdmin();
  const reportKey = z.enum(REPORT_KEYS).safeParse(formData.get("reportKey"));
  const guidance = z.string().trim().max(5_000).safeParse(formData.get("guidance"));
  if (!reportKey.success || !guidance.success) redirect("/accreditation/templates?result=invalid_requirements");
  const updated = await createAccreditationAdminClient().from("accreditation_report_definitions")
    .update({ custom_guidance: guidance.data, updated_at: new Date().toISOString() })
    .eq("report_key", reportKey.data);
  if (updated.error) redirect("/accreditation/templates?result=requirements_error");
  revalidatePath("/accreditation/templates");
  redirect("/accreditation/templates?result=requirements_saved");
}

export async function createRun(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const reportKey = z.enum(REPORT_KEYS).safeParse(formData.get("reportKey"));
  const cycleId = uuid.safeParse(formData.get("cycleId"));
  const termValue = String(formData.get("termId") ?? "");
  const termId = termValue ? uuid.safeParse(termValue) : null;
  if (!reportKey.success || !cycleId.success || (termId && !termId.success)) redirect("/accreditation?result=invalid_report");
  const definition = getReportDefinition(reportKey.data)!;
  if (definition.cadence === "term" && !termId?.success) redirect(`/accreditation?cycle=${cycleId.data}&result=term_required`);
  const supabase = createAccreditationAdminClient();
  let existingQuery = supabase.from("accreditation_runs").select("id").eq("report_key", reportKey.data).eq("cycle_id", cycleId.data).neq("status", "approved");
  existingQuery = termId?.success ? existingQuery.eq("term_id", termId.data) : existingQuery.is("term_id", null);
  const existing = await existingQuery.maybeSingle();
  if (existing.data) redirect(reportPath(existing.data.id));
  const cycle = await supabase.from("accreditation_cycles").select("label").eq("id", cycleId.data).single();
  if (cycle.error) redirect("/accreditation?result=invalid_report");
  const inserted = await supabase.from("accreditation_runs").insert({
    report_key: reportKey.data,
    cycle_id: cycleId.data,
    term_id: termId?.success ? termId.data : null,
    title: `${cycle.data.label} ${definition.name}`,
    created_by: userId,
  }).select("id").single();
  if (inserted.error) redirect(`/accreditation?cycle=${cycleId.data}&result=report_error`);
  revalidatePath("/accreditation");
  redirect(reportPath(inserted.data.id));
}

export async function createSuccessorRun(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  if (!runId.success) return;
  const supabase = createAccreditationAdminClient();
  const old = await supabase.from("accreditation_runs").select("report_key, cycle_id, term_id, title, status").eq("id", runId.data).single();
  if (old.error || old.data.status !== "approved") return;
  const inserted = await supabase.from("accreditation_runs").insert({
    report_key: old.data.report_key,
    cycle_id: old.data.cycle_id,
    term_id: old.data.term_id,
    title: `${old.data.title} — revision`,
    supersedes_run_id: runId.data,
    created_by: userId,
  }).select("id").single();
  if (inserted.error) return;
  revalidatePath("/accreditation");
  redirect(reportPath(inserted.data.id));
}

export async function generateDraft(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  const instruction = z.string().trim().max(10_000).catch("").parse(formData.get("instruction"));
  if (!runId.success) redirect("/accreditation?result=invalid_report");
  const supabase = createAccreditationAdminClient();
  const start = await supabase.from("accreditation_runs").update({ status: "drafting" }).eq("id", runId.data).neq("status", "approved");
  if (start.error) redirect(reportPath(runId.data, "draft_error"));
  try {
    const result = await buildDraft(runId.data, instruction);
    const [latest, run] = await Promise.all([
      supabase.from("accreditation_revisions").select("revision_number").eq("run_id", runId.data).order("revision_number", { ascending: false }).limit(1),
      supabase.from("accreditation_runs").select("report_key, cycle_id").eq("id", runId.data).single(),
    ]);
    if (run.error) throw new Error("Report not found.");
    const revisionId = crypto.randomUUID();
    const revisionNumber = Number(latest.data?.[0]?.revision_number ?? 0) + 1;
    const templateResult = await supabase.from("accreditation_templates").select("*").eq("report_key", run.data.report_key).eq("is_active", true).maybeSingle();
    const validation = [...result.validation];
    let rendered: Awaited<ReturnType<typeof renderTemplate>> | null = null;
    if (templateResult.data) {
      const file = await supabase.storage.from("accreditation-templates").download(templateResult.data.storage_path);
      if (file.error) {
        validation.push({ level: "error", message: "The active template could not be downloaded." });
      } else {
        try {
          rendered = await renderTemplate(
            new Uint8Array(await file.data.arrayBuffer()),
            templateResult.data.format,
            templateResult.data.mapping as TemplateMapping,
            result.draft,
          );
        } catch (error) {
          validation.push({ level: "error", message: error instanceof Error ? error.message : "Template rendering failed." });
        }
      }
    }
    const inserted = await supabase.from("accreditation_revisions").insert({
      id: revisionId,
      run_id: runId.data,
      revision_number: revisionNumber,
      user_instruction: instruction,
      draft: result.draft,
      app_snapshot: result.appSnapshot,
      source_manifest: result.sourceManifest,
      validation,
      provider_config: result.providerConfig,
      template_id: templateResult.data?.id ?? null,
      created_by: userId,
    });
    if (inserted.error) throw new Error(inserted.error.message);
    const citationRows = Object.entries(result.draft.fields).flatMap(([fieldKey, field]) => field.citations.map((ref) => {
      const citation = result.citations.find((item) => item.ref === ref);
      return citation ? {
        revision_id: revisionId,
        field_key: fieldKey,
        source_id: citation.sourceId ?? null,
        provenance: citation.provenance,
        locator: citation.locator ?? {},
        excerpt: citation.excerpt ?? "",
        app_record: citation.appRecord ?? null,
      } : null;
    }).filter(Boolean));
    if (citationRows.length) await supabase.from("accreditation_citations").insert(citationRows);
    let artifactReady = false;
    if (rendered) {
      const filename = `${run.data.report_key}-draft-r${revisionNumber}.${rendered.extension}`;
      const path = `${run.data.cycle_id}/${runId.data}/${revisionId}/draft/${filename}`;
      const uploaded = await supabase.storage.from("accreditation-artifacts").upload(path, rendered.bytes, { contentType: rendered.mimeType });
      if (!uploaded.error) {
        const artifact = await supabase.from("accreditation_artifacts").insert({
          revision_id: revisionId,
          kind: "draft",
          storage_path: path,
          filename,
          mime_type: rendered.mimeType,
          size_bytes: rendered.bytes.byteLength,
          sha256: sha256(rendered.bytes),
          created_by: userId,
        });
        artifactReady = !artifact.error;
      }
    }
    const hasErrors = validation.some((item) => item.level === "error");
    await supabase.from("accreditation_runs").update({ status: !hasErrors && artifactReady ? "ready_for_review" : "needs_input" }).eq("id", runId.data);
    revalidatePath(reportPath(runId.data));
    revalidatePath("/accreditation");
    redirect(reportPath(runId.data, !hasErrors && artifactReady ? "draft_ready" : "needs_input"));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    await supabase.from("accreditation_runs").update({ status: "collecting" }).eq("id", runId.data);
    console.error("Accreditation draft generation failed", error);
    redirect(reportPath(runId.data, "draft_error"));
  }
}

export async function approveReport(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  const revisionId = uuid.safeParse(formData.get("revisionId"));
  if (!runId.success || !revisionId.success || formData.get("reviewed") !== "on") {
    if (runId.success) redirect(reportPath(runId.data, "review_required"));
    redirect("/accreditation?result=invalid_report");
  }
  const supabase = createAccreditationAdminClient();
  const revision = await supabase.from("accreditation_revisions").select("id, run_id, validation, immutable").eq("id", revisionId.data).eq("run_id", runId.data).single();
  const artifact = await supabase.from("accreditation_artifacts").select("*").eq("revision_id", revisionId.data).eq("kind", "draft").single();
  if (revision.error || artifact.error || revision.data.immutable || (revision.data.validation as Array<{ level?: string }>).some((item) => item.level === "error")) {
    redirect(reportPath(runId.data, "approval_blocked"));
  }
  const approvedPath = artifact.data.storage_path.replace("/draft/", "/approved/").replace("-draft-", "-approved-");
  const copy = await supabase.storage.from("accreditation-artifacts").copy(artifact.data.storage_path, approvedPath);
  if (copy.error) redirect(reportPath(runId.data, "approval_error"));
  const approved = await supabase.from("accreditation_artifacts").insert({
    revision_id: revisionId.data,
    kind: "approved",
    storage_path: approvedPath,
    filename: artifact.data.filename.replace("-draft-", "-approved-"),
    mime_type: artifact.data.mime_type,
    size_bytes: artifact.data.size_bytes,
    sha256: artifact.data.sha256,
    created_by: userId,
  });
  if (approved.error) {
    await supabase.storage.from("accreditation-artifacts").remove([approvedPath]);
    redirect(reportPath(runId.data, "approval_error"));
  }
  const frozen = await supabase.rpc("approve_accreditation_revision", {
    p_run_id: runId.data,
    p_revision_id: revisionId.data,
    p_approved_by: userId,
  });
  if (frozen.error) {
    await supabase.from("accreditation_artifacts").delete().eq("revision_id", revisionId.data).eq("kind", "approved");
    await supabase.storage.from("accreditation-artifacts").remove([approvedPath]);
    redirect(reportPath(runId.data, "approval_error"));
  }
  revalidatePath("/accreditation", "layout");
  redirect(reportPath(runId.data, "approved"));
}
