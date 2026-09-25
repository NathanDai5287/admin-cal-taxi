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
import { resolveTemplateChat, TEMPLATE_CHAT_MAX_HISTORY, TEMPLATE_CHAT_MAX_MESSAGE, type TemplateChatMessage } from "@/lib/accreditation/template-chat";
import { loadTemplateDraftContext } from "@/lib/accreditation/template-context";
import type { TemplateChatResult } from "@/lib/accreditation/template-drafting";
import { getAccreditationProviders } from "@/lib/accreditation/providers";
import { extractSource } from "@/lib/accreditation/extract";
import { REPORT_KEYS, type ReportDraft, type SourceKind, type TemplateAnalysis, type TemplateMapping } from "@/lib/accreditation/types";
import { buildDraft } from "@/lib/accreditation/workflow";
import { requireAdmin } from "@/lib/reimbursements/auth";

async function requireAccreditationAdmin() {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  return requireAdmin();
}

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceKinds = ["evidence", "blank_template", "prior_submission"] as const;

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

function evidenceReturnPath(formData: FormData) {
  return formData.get("returnTo") === "/ask-policy/evidence" ? "/ask-policy/evidence" : "/accreditation/library";
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
  let cycleId = crypto.randomUUID();
  let createdYear = true;
  const cycle = await supabase.from("academic_years").insert({
    id: cycleId,
    label: values.label,
    starts_on: values.fallStart,
    ends_on: values.springEnd,
    created_by: userId,
  });
  if (cycle.error) {
    const existing = await supabase.from("academic_years").select("id,academic_terms(id)").eq("label", values.label).maybeSingle();
    if (!existing.data) redirect("/accreditation?result=cycle_error");
    if (Array.isArray(existing.data.academic_terms) && existing.data.academic_terms.length >= 2) {
      redirect("/accreditation?result=cycle_error");
    }
    cycleId = String(existing.data.id);
    createdYear = false;
    const updated = await supabase.from("academic_years").update({ starts_on: values.fallStart, ends_on: values.springEnd }).eq("id", cycleId);
    if (updated.error) redirect("/accreditation?result=cycle_error");
  }
  const termRows = [
    { cycle_id: cycleId, season: "fall", label: `Fall ${values.label}`, starts_on: values.fallStart, ends_on: values.fallEnd },
    { cycle_id: cycleId, season: "spring", label: `Spring ${values.label}`, starts_on: values.springStart, ends_on: values.springEnd },
  ];
  const terms = await supabase.from("academic_terms").upsert(termRows, { onConflict: "cycle_id,season" }).select("id,starts_on,ends_on");
  if (terms.error) {
    if (createdYear) await supabase.from("academic_years").delete().eq("id", cycleId);
    redirect("/accreditation?result=cycle_error");
  }
  const today = new Date().toISOString().slice(0, 10);
  const currentTerm = terms.data?.find((term: { id: string; starts_on: string; ends_on: string }) => term.starts_on <= today && term.ends_on >= today);
  if (currentTerm) {
    await supabase.from("chapter_financial_settings").update({ academic_term_id: currentTerm.id, updated_by: userId }).eq("id", true);
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
  const familyValue = String(formData.get("templateFamilyId") ?? "");
  const templateFamilyId = familyValue ? uuid.safeParse(familyValue) : null;
  const file = formData.get("file");
  if (!cycleId.success || !kind.success || (termId && !termId.success) || (reportKey && !reportKey.success) || (templateFamilyId && !templateFamilyId.success) || !(file instanceof File)) {
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
    template_family_id: templateFamilyId?.success ? templateFamilyId.data : null,
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
  const familyValue = String(formData.get("templateFamilyId") ?? "");
  const templateFamilyId = familyValue ? uuid.safeParse(familyValue) : null;
  const file = formData.get("file");
  if (!cycleId.success || !kind.success || (termId && !termId.success) || (reportKey && !reportKey.success) || (templateFamilyId && !templateFamilyId.success) || !(file instanceof File)) {
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
    template_family_id: templateFamilyId?.success ? templateFamilyId.data : null,
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
    console.error("Accreditation evidence record insert failed", inserted.error);
    await db.storage.from("accreditation-sources").remove([storagePath]);
    const details = serviceErrorText(inserted.error);
    return { ok: false, message: /PGRST204|schema cache|invalid input value for enum accreditation_source_kind/i.test(details)
      ? "The evidence database is out of date. Apply pending accreditation migrations, then retry."
      : "Evidence could not be saved. Retry the upload or contact an administrator." };
  }
  revalidatePath("/accreditation/library");
  revalidatePath("/ask-policy/evidence");
  return { ok: true, id, message: "Uploaded. Waiting to embed." };
}

export async function processAccreditationBatchItem(idValue: string): Promise<BatchProcessResult> {
  await requireAccreditationAdmin();
  const id = uuid.safeParse(idValue);
  if (!id.success) return { ok: false, retryable: false, message: "The uploaded evidence ID is invalid." };
  try {
    await processDocument(id.data, false, true);
    revalidatePath("/accreditation/library");
    revalidatePath("/ask-policy/evidence");
    return { ok: true, retryable: false, message: "Embedding complete." };
  } catch (error) {
    revalidatePath("/accreditation/library");
    revalidatePath("/ask-policy/evidence");
    const retryable = isRetryableAiError(error);
    return { ok: false, retryable, message: retryable ? "Gemini is rate-limited or overloaded." : "Processing failed. Review the document error." };
  }
}

export async function reprocessSource(formData: FormData) {
  await requireAccreditationAdmin();
  const returnPath = evidenceReturnPath(formData);
  const id = uuid.parse(formData.get("sourceId"));
  try {
    await processDocument(id, false, formData.get("signatureFree") === "on");
  } catch {
    revalidatePath("/accreditation/library");
    revalidatePath("/ask-policy/evidence");
    redirect(`${returnPath}?result=processing_failed_check_source_error`);
  }
  revalidatePath("/accreditation/library");
  revalidatePath("/ask-policy/evidence");
  redirect(`${returnPath}?result=reembedded`);
}

export async function archiveSource(formData: FormData) {
  await requireAccreditationAdmin();
  const sourceId = uuid.safeParse(formData.get("sourceId"));
  if (!sourceId.success) return;
  await createAccreditationAdminClient().from("accreditation_sources").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", sourceId.data);
  revalidatePath("/accreditation/library");
  revalidatePath("/ask-policy/evidence");
}

export async function deleteSource(formData: FormData) {
  await requireAccreditationAdmin();
  const returnPath = evidenceReturnPath(formData);
  const sourceId = uuid.safeParse(formData.get("sourceId"));
  if (!sourceId.success || formData.get("confirmDelete") !== "on") redirect(`${returnPath}?result=confirm_deletion`);
  const db = createAccreditationAdminClient();
  const source = await db.from("accreditation_sources").select("cycle_id,storage_path").eq("id", sourceId.data).maybeSingle();
  if (!source.data) redirect(`${returnPath}?result=source_not_found`);
  const removed = await db.from("accreditation_sources").delete().eq("id", sourceId.data).select("id");
  if (removed.error || !removed.data?.length) {
    redirect(`${returnPath}?cycle=${source.data.cycle_id}&result=source_is_in_use_archive_instead`);
  }
  const storage = await db.storage.from("accreditation-sources").remove([source.data.storage_path]);
  revalidatePath("/accreditation", "layout");
  revalidatePath("/ask-policy/evidence");
  redirect(`${returnPath}?cycle=${source.data.cycle_id}&result=${storage.error ? "document_and_embeddings_deleted_storage_cleanup_failed" : "document_and_embeddings_deleted"}`);
}

export async function uploadTemplate(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const templateName = z.string().trim().min(1).max(160).safeParse(formData.get("templateName"));
  const guidance = z.string().trim().max(5_000).catch("").parse(formData.get("guidance"));
  const file = formData.get("file");
  const example = formData.get("example");
  const exampleFile = example instanceof File && example.size > 0 ? example : null;
  if (!templateName.success || !(file instanceof File)) redirect("/accreditation/templates?result=invalid");
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
      templateName: templateName.data,
      guidance,
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
  let family = await supabase.from("accreditation_template_families").select("id").ilike("name", templateName.data).is("archived_at", null).maybeSingle();
  if (!family.data && !family.error) {
    family = await supabase.from("accreditation_template_families").insert({ name: templateName.data, description: analysis.description, guidance, created_by: userId }).select("id").single();
  }
  if (family.error || !family.data) {
    console.error("Accreditation template family insert failed", family.error);
    redirect(`/accreditation/templates?result=${templateRecordResult(family.error)}`);
  }
  const familyId = String(family.data.id);
  if (guidance) await supabase.from("accreditation_template_families").update({ guidance }).eq("id", familyId);
  const versions = await supabase.from("accreditation_templates").select("version").eq("template_family_id", familyId).order("version", { ascending: false }).limit(1);
  if (versions.error) {
    console.error("Accreditation template version lookup failed", versions.error);
    redirect(`/accreditation/templates?result=${templateRecordResult(versions.error)}`);
  }
  const version = Number(versions.data?.[0]?.version ?? 0) + 1;
  const templateId = crypto.randomUUID();
  const path = `${familyId}/${templateId}/${safeName(file.name)}`;
  const mimeType = fileMimeType(file);
  const uploaded = await supabase.storage.from("accreditation-templates").upload(path, bytes, { contentType: mimeType });
  if (uploaded.error) {
    console.error("Accreditation template original upload failed", uploaded.error);
    redirect(`/accreditation/templates?result=${templateStorageResult(uploaded.error)}`);
  }
  const mapping = mappingFromAnalysis(analysis);
  let examplePath: string | null = null;
  if (exampleFile) {
    examplePath = `${familyId}/${templateId}/example-${safeName(exampleFile.name)}`;
    const exampleUpload = await supabase.storage.from("accreditation-templates").upload(examplePath, new Uint8Array(await exampleFile.arrayBuffer()), { contentType: fileMimeType(exampleFile) });
    if (exampleUpload.error) {
      await supabase.storage.from("accreditation-templates").remove([path]);
      console.error("Accreditation template example upload failed", exampleUpload.error);
      redirect(`/accreditation/templates?result=${templateStorageResult(exampleUpload.error, "template_example_storage_failed")}`);
    }
  }
  const sampleDraft: ReportDraft = { fields: Object.fromEntries(analysis.fields.map((field) => [field.key, {
    value: field.valueMode === "checkbox" ? "true" : `Sample ${field.label}`,
    provenance: "user_input" as const,
    citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true,
  }])) };
  let previewPath: string | null = null;
  try {
    const rendered = await renderTemplate(bytes, format, mapping, sampleDraft);
    previewPath = `${familyId}/${templateId}/preview.${rendered.extension}`;
    const previewUpload = await supabase.storage.from("accreditation-templates").upload(previewPath, rendered.bytes, { contentType: rendered.mimeType });
    if (previewUpload.error) throw previewUpload.error;
  } catch (error) {
    if (examplePath) await supabase.storage.from("accreditation-templates").remove([examplePath]);
    await supabase.storage.from("accreditation-templates").remove([path]);
    console.error("Accreditation template preview failed", error);
    redirect(`/accreditation/templates?result=template_analysis_failed`);
  }
  const inserted = await supabase.from("accreditation_templates").insert({
    id: templateId,
    template_family_id: familyId,
    report_key: null,
    version,
    format,
    original_name: file.name,
    mime_type: mimeType,
    storage_path: path,
    sha256: sha256(bytes),
    mapping,
    analysis_status: "analyzing",
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
  await supabase.from("accreditation_templates").update({ is_active: false }).eq("template_family_id", familyId).neq("id", templateId);
  await supabase.from("accreditation_templates").update({ is_active: true, analysis_status: "active" }).eq("id", templateId);
  revalidatePath("/accreditation/templates");
  revalidatePath("/accreditation", "layout");
  redirect(`/accreditation/templates?template=${templateId}&result=template_ready`);
}

export async function confirmTemplate(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const templateId = uuid.safeParse(formData.get("templateId"));
  if (!templateId.success) redirect("/accreditation/templates?result=invalid_mapping");
  const supabase = createAccreditationAdminClient();
  const template = await supabase.from("accreditation_templates").select("template_family_id, report_key, format, mapping, storage_path, analysis_status, analysis").eq("id", templateId.data).single();
  if (template.error) redirect("/accreditation/templates?result=invalid_mapping");
  if (template.data.analysis_status !== "active" && template.data.analysis_status !== "needs_review") redirect(`/accreditation/templates?template=${templateId.data}&result=analysis_not_ready`);
  const mapping: TemplateMapping = (template.data.mapping ?? {}) as TemplateMapping;
  const analyzedFields = Array.isArray((template.data.analysis as Record<string, unknown> | null)?.fields) ? (template.data.analysis as { fields: Array<{ key?: unknown; required?: unknown }> }).fields : [];
  const storedFile = await supabase.storage.from("accreditation-templates").download(template.data.storage_path);
  if (storedFile.error) redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  const sampleDraft: ReportDraft = { fields: Object.fromEntries(analyzedFields.map((field) => [String(field.key), {
    value: `Sample ${String(field.key)}`, provenance: "user_input" as const, citations: ["USER"], confidence: 1, missingReason: null, officerOverride: true,
  }])) };
  try {
    await renderTemplate(new Uint8Array(await storedFile.data.arrayBuffer()), template.data.format, mapping, sampleDraft);
  } catch {
    redirect(`/accreditation/templates?template=${templateId.data}&result=invalid_mapping`);
  }
  if (template.data.template_family_id) await supabase.from("accreditation_templates").update({ is_active: false }).eq("template_family_id", template.data.template_family_id);
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

export async function startTemplateSubmission(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const familyId = uuid.safeParse(formData.get("templateFamilyId"));
  const requestedTerm = String(formData.get("termId") ?? "");
  if (!familyId.success) redirect("/accreditation/templates?result=start_error");
  const supabase = createAccreditationAdminClient();
  const [family, cycles, activeTemplate] = await Promise.all([
    supabase.from("accreditation_template_families").select("id, name").eq("id", familyId.data).is("archived_at", null).single(),
    supabase.from("academic_years").select("id,label,starts_on,ends_on,academic_terms(id,label,starts_on,ends_on)").order("starts_on", { ascending: false }),
    supabase.from("accreditation_templates").select("id").eq("template_family_id", familyId.data).eq("is_active", true).single(),
  ]);
  if (family.error || !family.data || cycles.error || !cycles.data?.length || activeTemplate.error || !activeTemplate.data) redirect("/accreditation/templates?result=start_error");
  const today = new Date().toISOString().slice(0, 10);
  const cycle = ((cycles.data as Array<Record<string, unknown>>).find((item) => String(item.starts_on) <= today && String(item.ends_on) >= today) ?? cycles.data[0]) as Record<string, unknown>;
  const terms = (Array.isArray((cycle as Record<string, unknown>).academic_terms) ? (cycle as Record<string, unknown>).academic_terms : []) as Array<Record<string, unknown>>;
  const term = (requestedTerm ? terms.find((item) => String(item.id) === requestedTerm) ?? null : terms.find((item) => String(item.starts_on) <= today && String(item.ends_on) >= today) ?? null);
  let existingQuery = supabase.from("accreditation_runs").select("id").eq("template_family_id", familyId.data).eq("cycle_id", cycle.id).neq("status", "approved");
  existingQuery = term ? existingQuery.eq("term_id", term.id) : existingQuery.is("term_id", null);
  const existing = await existingQuery.maybeSingle();
  if (existing.data) redirect(reportPath(existing.data.id));
  const inserted = await supabase.from("accreditation_runs").insert({
    template_family_id: familyId.data,
    template_id: activeTemplate.data.id,
    report_key: null,
    cycle_id: cycle.id,
    term_id: term?.id ?? null,
    title: `${cycle.label} ${family.data.name}`.slice(0, 160),
    created_by: userId,
  }).select("id").single();
  if (inserted.error) redirect("/accreditation/templates?result=start_error");
  await supabase.from("accreditation_run_working_state").insert({ run_id: inserted.data.id, draft: { fields: {} }, readiness: { ready: false, missing: [] }, updated_by: userId });
  revalidatePath("/accreditation", "layout");
  redirect(reportPath(inserted.data.id));
}

function parseTemplateAnalysis(value: unknown): TemplateAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const analysis = value as Partial<TemplateAnalysis>;
  if (!Array.isArray(analysis.fields)) return null;
  return {
    name: typeof analysis.name === "string" ? analysis.name : "Accreditation form",
    description: typeof analysis.description === "string" ? analysis.description : "",
    cadence: analysis.cadence,
    fields: analysis.fields.filter((field): field is TemplateAnalysis["fields"][number] => Boolean(field && typeof field.key === "string" && typeof field.label === "string" && typeof field.valueMode === "string")),
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings.filter((item): item is string => typeof item === "string") : [],
    model: typeof analysis.model === "string" ? analysis.model : "unknown",
    templateText: typeof analysis.templateText === "string" ? analysis.templateText : undefined,
    exampleText: typeof analysis.exampleText === "string" ? analysis.exampleText : undefined,
  };
}

export async function sendTemplateMessage(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  const message = z.string().trim().min(1).max(TEMPLATE_CHAT_MAX_MESSAGE).safeParse(formData.get("message"));
  if (!runId.success || !message.success) return { error: "Enter a message up to 4,000 characters." };
  const supabase = createAccreditationAdminClient();
  const run = await supabase.from("accreditation_runs").select("id,template_family_id,template_id,cycle_id,term_id,status").eq("id", runId.data).single();
  if (run.error || !run.data?.template_family_id || run.data.status === "approved") return { error: "This submission is no longer editable." };
  let templateQuery = supabase.from("accreditation_templates").select("id,analysis,template_family_id,original_name,mime_type,storage_path,example_storage_path,example_original_name");
  templateQuery = run.data.template_id
    ? templateQuery.eq("id", run.data.template_id)
    : templateQuery.eq("template_family_id", run.data.template_family_id).eq("is_active", true);
  const [template, family, messages, state] = await Promise.all([
    templateQuery.maybeSingle(),
    supabase.from("accreditation_template_families").select("name,description,guidance").eq("id", run.data.template_family_id).single(),
    supabase.from("accreditation_run_messages").select("role,content").eq("run_id", runId.data).order("created_at", { ascending: false }).limit(TEMPLATE_CHAT_MAX_HISTORY),
    supabase.from("accreditation_run_working_state").select("draft").eq("run_id", runId.data).maybeSingle(),
  ]);
  const analysis = parseTemplateAnalysis(template.data?.analysis);
  if (template.error || !template.data || !analysis || family.error || !family.data) return { error: "The active template is not ready for chat." };
  if (messages.error || state.error) return { error: "The saved conversation could not be loaded. Try again." };
  const history = (messages.data ?? []).reverse().filter((item: Record<string, unknown>): item is TemplateChatMessage => (item.role === "user" || item.role === "assistant") && typeof item.content === "string");
  try {
    const context = await loadTemplateDraftContext(run.data, { ...template.data, analysis }, message.data);
    const result = await resolveTemplateChat({ analysis, guidance: family.data.guidance ?? "", history, draft: state.data?.draft as ReportDraft | undefined, message: message.data, context });
    const userInsert = await supabase.from("accreditation_run_messages").insert({ run_id: runId.data, role: "user", content: message.data, created_by: userId });
    if (userInsert.error) return { error: "The message could not be saved. Try again." };
    const assistantInsert = await supabase.from("accreditation_run_messages").insert({ run_id: runId.data, role: "assistant", content: result.answer, field_updates: result.updates, created_by: userId });
    if (assistantInsert.error) return { error: "The assistant response could not be saved. Try again." };
    const saved = await supabase.from("accreditation_run_working_state").upsert({ run_id: runId.data, draft: result.draft,
      readiness: { ready: result.ready, missing: result.missing, warnings: result.warnings, sources: result.sources, ruleChecks: result.ruleChecks, model: result.model,
        policyDate: context.policyDate, academicYear: context.academicYear, term: context.term },
      updated_by: userId, updated_at: new Date().toISOString() });
    if (saved.error) return { error: "The draft could not be saved. Please retry your message." };
    const statusUpdate = await supabase.from("accreditation_runs").update({ status: result.ready ? "collecting" : "needs_input" }).eq("id", runId.data).neq("status", "approved");
    if (statusUpdate.error) return { error: "The draft was saved, but its status could not be updated. Reload and try again." };
    revalidatePath(reportPath(runId.data));
    return { answer: result.answer, draft: result.draft, missing: result.missing, ready: result.ready, warnings: result.warnings, sources: result.sources, ruleChecks: result.ruleChecks };
  } catch (error) {
    console.error("Template chat failed", error);
    return { error: error instanceof Error ? error.message : "The assistant could not respond right now." };
  }
}

export async function clearTemplateConversation(formData: FormData) {
  await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  if (!runId.success) return;
  const supabase = createAccreditationAdminClient();
  const run = await supabase.from("accreditation_runs").select("status").eq("id", runId.data).single();
  if (run.error || run.data.status === "approved") return;
  await supabase.from("accreditation_run_messages").delete().eq("run_id", runId.data);
  await supabase.from("accreditation_run_working_state").upsert({ run_id: runId.data, draft: { fields: {} }, readiness: { ready: false, missing: [] }, updated_at: new Date().toISOString() });
  revalidatePath(reportPath(runId.data));
  redirect(reportPath(runId.data));
}

export async function generateTemplateSubmission(formData: FormData) {
  const { userId } = await requireAccreditationAdmin();
  const runId = uuid.safeParse(formData.get("runId"));
  if (!runId.success) redirect("/accreditation/templates?result=start_error");
  const supabase = createAccreditationAdminClient();
  const runResult = await supabase.from("accreditation_runs").select("id,template_family_id,template_id,cycle_id,status").eq("id", runId.data).single();
  if (runResult.error || !runResult.data?.template_family_id || runResult.data.status === "approved") redirect(reportPath(runId.data, "generation_error"));
  let templateQuery = supabase.from("accreditation_templates").select("id,format,mapping,storage_path,analysis");
  templateQuery = runResult.data.template_id
    ? templateQuery.eq("id", runResult.data.template_id)
    : templateQuery.eq("template_family_id", runResult.data.template_family_id).eq("is_active", true);
  const [templateResult, familyResult, stateResult] = await Promise.all([
    templateQuery.maybeSingle(),
    supabase.from("accreditation_template_families").select("name").eq("id", runResult.data.template_family_id).single(),
    supabase.from("accreditation_run_working_state").select("draft,readiness").eq("run_id", runId.data).maybeSingle(),
  ]);
  const analysis = parseTemplateAnalysis(templateResult.data?.analysis);
  const draft = stateResult.data?.draft as ReportDraft | undefined;
  const readiness = stateResult.data?.readiness as Partial<TemplateChatResult> | undefined;
  const missing = analysis?.fields.filter((field) => field.required && field.target && !draft?.fields?.[field.key]?.value).map((field) => field.label) ?? [];
  if (templateResult.error || familyResult.error || stateResult.error || !templateResult.data || !familyResult.data || !analysis || !draft || missing.length || !readiness?.ready || readiness.missing?.length) redirect(reportPath(runId.data, "needs_input"));
  await supabase.from("accreditation_runs").update({ status: "drafting" }).eq("id", runId.data).neq("status", "approved");
  try {
    const stored = await supabase.storage.from("accreditation-templates").download(templateResult.data.storage_path);
    if (stored.error) throw new Error("The active template could not be downloaded.");
    const rendered = await renderTemplate(new Uint8Array(await stored.data.arrayBuffer()), templateResult.data.format, templateResult.data.mapping as TemplateMapping, draft);
    const latest = await supabase.from("accreditation_revisions").select("revision_number").eq("run_id", runId.data).order("revision_number", { ascending: false }).limit(1);
    const revisionId = crypto.randomUUID();
    const revisionNumber = Number(latest.data?.[0]?.revision_number ?? 0) + 1;
    const inserted = await supabase.from("accreditation_revisions").insert({
      id: revisionId,
      run_id: runId.data,
      revision_number: revisionNumber,
      user_instruction: "Generated from conversational template completion.",
      draft,
      app_snapshot: { draftingContext: stateResult.data.readiness },
      source_manifest: readiness.sources ?? [],
      validation: (readiness.warnings ?? []).map((message) => ({ level: "warning", message })),
      provider_config: { mode: "dynamic_template", model: readiness.model ?? analysis.model },
      template_id: templateResult.data.id,
      created_by: userId,
    });
    if (inserted.error) throw new Error(inserted.error.message);
    const filename = `${safeName(String(familyResult.data.name))}-draft-r${revisionNumber}.${rendered.extension}`;
    const path = `${runResult.data.cycle_id}/${runId.data}/${revisionId}/draft/${filename}`;
    const uploaded = await supabase.storage.from("accreditation-artifacts").upload(path, rendered.bytes, { contentType: rendered.mimeType });
    if (uploaded.error) throw new Error("The completed file could not be saved.");
    const artifact = await supabase.from("accreditation_artifacts").insert({ revision_id: revisionId, kind: "draft", storage_path: path, filename, mime_type: rendered.mimeType, size_bytes: rendered.bytes.byteLength, sha256: sha256(rendered.bytes), created_by: userId });
    if (artifact.error) throw new Error("The completed file record could not be saved.");
    await supabase.from("accreditation_runs").update({ status: "ready_for_review" }).eq("id", runId.data);
    revalidatePath(reportPath(runId.data));
    revalidatePath("/accreditation", "layout");
    redirect(reportPath(runId.data, "draft_ready"));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Dynamic template generation failed", error);
    await supabase.from("accreditation_runs").update({ status: "needs_input" }).eq("id", runId.data);
    redirect(reportPath(runId.data, "generation_error"));
  }
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
  const cycle = await supabase.from("academic_years").select("label").eq("id", cycleId.data).single();
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
