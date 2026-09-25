import "server-only";

import { getPolicyClock } from "../policy/tools";
import { extractSource } from "./extract";
import { getAccreditationProviders } from "./providers";
import { createAccreditationAdminClient } from "./supabase";
import type { TemplateDraftContext, TemplateDraftSource } from "./template-drafting";
import type { ReportDraft, TemplateAnalysis } from "./types";

type ContextTemplate = {
  id: string;
  original_name: string;
  mime_type: string;
  storage_path: string;
  example_storage_path: string | null;
  example_original_name: string | null;
  analysis: TemplateAnalysis;
};
type ContextRun = { id: string; template_family_id: string; cycle_id: string; term_id: string | null };

export async function loadTemplateDraftContext(run: ContextRun, template: ContextTemplate, message: string): Promise<TemplateDraftContext> {
  const db = createAccreditationAdminClient();
  const providers = getAccreditationProviders();
  const sources: TemplateDraftSource[] = [];
  const warnings: string[] = [];
  const [year, term] = await Promise.all([
    db.from("academic_years").select("label,starts_on,ends_on").eq("id", run.cycle_id).single(),
    run.term_id ? db.from("academic_terms").select("label,starts_on,ends_on").eq("id", run.term_id).single() : Promise.resolve({ data: null, error: null }),
  ]);
  if (year.error || term.error || !year.data) throw new Error("The submission's academic dates could not be loaded.");
  const today = getPolicyClock().local_date;
  const period = term.data ?? year.data;
  const policyDate = today < period.starts_on ? period.starts_on : today > period.ends_on ? period.ends_on : today;

  const readTemplateText = async (example: boolean) => {
    const storedText = example ? template.analysis.exampleText : template.analysis.templateText;
    const path = example ? template.example_storage_path : template.storage_path;
    const name = example ? template.example_original_name : template.original_name;
    if (!path || !name) return;
    try {
      let content = storedText;
      if (content === undefined) {
        const file = await db.storage.from("accreditation-templates").download(path);
        if (file.error || !file.data) throw new Error("Template context download failed.");
        const chunks = await extractSource(new Uint8Array(await file.data.arrayBuffer()), name, template.mime_type, providers.ocr);
        content = chunks.map((chunk) => chunk.content).join("\n\n");
      }
      if (content.trim()) sources.push({
        ref: example ? "EXAMPLE" : "TEMPLATE", title: name,
        kind: example ? "example" : "template", content: content.slice(0, 30_000),
      });
      if (content.length > 30_000) warnings.push(`Only the first part of ${name} was included. Review any additional requirements in the original.`);
    } catch (error) {
      console.error("Template drafting document context failed", error);
      warnings.push(example ? "The completed example could not be read; this draft may not reflect it." : "The original form's instructions could not be read; review them before submission.");
    }
  };

  const retrieveLibrary = async () => {
    try {
      if (!providers.embeddings) throw new Error("Embedding provider is not configured.");
      const query = [template.analysis.name, template.analysis.description, "chapter requirements guidelines prior schedule", message,
        ...template.analysis.fields.map((field) => `${field.label} ${field.description}`)].join(" ").slice(0, 12_000);
      const embedding = await providers.embeddings.embedQuery(query);
      const result = await db.rpc("search_template_drafting_context", {
        p_query: query, p_embedding: JSON.stringify(embedding), p_profile: providers.embeddings.profile,
        p_date: policyDate, p_family: run.template_family_id, p_cycle_start: year.data.starts_on,
      });
      if (result.error) throw result.error;
      for (const row of (result.data ?? []) as Array<{ source_kind: "policy" | "evidence" | "prior_submission"; source_id: string; ordinal: number; content: string; title: string; locator: Record<string, unknown> }>) {
        sources.push({ ref: `${row.source_kind}:${row.source_id}:${row.ordinal}`, title: row.title, kind: row.source_kind,
          content: row.content, sourceId: row.source_id, locator: row.locator });
      }
      if (!result.data?.length) warnings.push("No relevant library passages were found. Review chapter requirements against your available guidance.");
    } catch (error) {
      console.error("Template drafting library retrieval failed", error);
      warnings.push("The chapter library could not be searched. This draft uses the available template and examples; chapter rules need review.");
    }
  };

  const loadSavedSubmissions = async () => {
    try {
      const runs = await db.from("accreditation_runs")
        .select("id,title,approved_revision_id,academic_years!inner(starts_on)")
        .eq("template_family_id", run.template_family_id).eq("status", "approved")
        .lt("academic_years.starts_on", year.data.starts_on).order("approved_at", { ascending: false }).limit(3);
      if (runs.error) throw runs.error;
      const ids = (runs.data ?? []).map((item: { approved_revision_id: string }) => item.approved_revision_id).filter(Boolean);
      if (!ids.length) return;
      const revisions = await db.from("accreditation_revisions").select("id,run_id,draft").in("id", ids);
      if (revisions.error) throw revisions.error;
      for (const revision of (revisions.data ?? []) as Array<{ id: string; run_id: string; draft: ReportDraft }>) {
        const content = Object.entries(revision.draft.fields ?? {}).map(([key, field]) => `${key}: ${field.value}`).join("\n").slice(0, 20_000);
        if (content) sources.push({ ref: `SAVED:${revision.id}`, title: runs.data.find((item: { id: string }) => item.id === revision.run_id)?.title ?? "Prior approved submission",
          kind: "saved_submission", content, sourceId: revision.run_id });
      }
    } catch (error) {
      console.error("Previous template submissions could not be loaded", error);
      warnings.push("Saved prior submissions could not be compared. Check this draft for repeated activities.");
    }
  };

  await Promise.all([readTemplateText(false), readTemplateText(true), retrieveLibrary(), loadSavedSubmissions()]);
  // Keep prompt order stable despite parallel retrieval.
  sources.sort((left, right) => left.ref.localeCompare(right.ref));
  if (!sources.some((source) => ["example", "prior_submission", "saved_submission"].includes(source.kind))) {
    warnings.push("No prior example was available for comparison. This is a new draft based on the form and available guidance.");
  }
  return { sources, warnings, academicYear: year.data, term: term.data, policyDate };
}
