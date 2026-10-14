import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

import { cropWarnings, type CropWarning } from "./crop-warnings";
import {
  DEFAULT_DONATE, NU_NEWS_BUCKET, canPreview, issueSchema, missingItems, photoSources, previewPath, type NuNewsIssue,
} from "./issue";
import { newsletterInput, renderNuNewsPdf } from "./pdf";
import { loadIssue } from "./store";

export type ActionResult<Success = object> = ({ ok: true } & Success) | { ok: false; message: string };
export type NewIssueDetails = Partial<Pick<NuNewsIssue, "season" | "issue_date" | "location">> & { id?: string };
export type Finalizer = { userId: string; name: string };

export const FINAL_ISSUE = "This issue is final and can no longer change.";

const issueId = z.uuid();
const IMMUTABLE = "22023";
const BUILD_FAILED = "The PDF could not be made. Upload any missing photos again, then try again.";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function currentSeason(today = new Date()) {
  return `${today.getMonth() >= 6 ? "Fall" : "Spring"} ${today.getFullYear()}`;
}

export async function createDraft(details: NewIssueDetails = {}) {
  const admin = createAdminClient();
  const previous = await admin
    .from("nu_news_issues")
    .select("location, donate")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) throw new Error(`Unable to read the previous Nu News issue: ${previous.error.message}`);

  const created = await admin
    .from("nu_news_issues")
    .insert({ season: currentSeason(), location: previous.data?.location, donate: previous.data?.donate ?? DEFAULT_DONATE, ...details })
    .select("id")
    .single();
  if (created.error) throw new Error(`Unable to create a Nu News issue: ${created.error.message}`);
  return created.data.id;
}

export async function saveDraft(id: string, issue: NuNewsIssue): Promise<ActionResult> {
  const parsed = issueSchema.safeParse(issue);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { error } = await createAdminClient().from("nu_news_issues").update(parsed.data).eq("id", issueId.parse(id));
  if (error?.code === IMMUTABLE) return { ok: false, message: FINAL_ISSUE };
  if (error) return { ok: false, message: "The issue could not be saved. Try again." };
  return { ok: true };
}

async function downloadPhotos(issue: NuNewsIssue) {
  const storage = createAdminClient().storage.from(NU_NEWS_BUCKET);
  return new Map(await Promise.all(photoSources(issue).map(async (src) => {
    const { data, error } = await storage.download(src);
    if (error) throw error;
    return [src, Buffer.from(await data.arrayBuffer())] as const;
  })));
}

async function buildPdf(issue: NuNewsIssue, mark: "draft" | "final") {
  try {
    const photos = await downloadPhotos(issue);
    return { photos, ...renderNuNewsPdf(issue, photos, mark) };
  } catch (error) {
    console.error("Nu News PDF generation failed", error);
    return null;
  }
}

export async function makeDraftPreview(id: string): Promise<ActionResult<{ madeAt: string; warnings: CropWarning[] }>> {
  const issue = await loadIssue(issueId.parse(id));
  if (!issue || issue.finalized_at) return { ok: false, message: "Only a draft issue has a preview." };
  if (!canPreview(issue)) return { ok: false, message: "Add the title photo and every headshot to make a preview." };
  const built = await buildPdf(issue, "draft");
  if (!built) return { ok: false, message: BUILD_FAILED };

  const admin = createAdminClient();
  const upload = await admin.storage.from(NU_NEWS_BUCKET).upload(previewPath(issue.id), built.pdf, { contentType: "application/pdf", upsert: true });
  if (upload.error) return { ok: false, message: "The preview could not be stored. Try again." };
  const madeAt = new Date().toISOString();
  const { error } = await admin.from("nu_news_issues").update({ preview_made_at: madeAt }).eq("id", issue.id);
  if (error) return { ok: false, message: "The preview could not be recorded. Try again." };

  return { ok: true, madeAt, warnings: cropWarnings(issue, built.placements) };
}

export async function finalizeDraft(id: string, finalizer: Finalizer): Promise<ActionResult> {
  const issue = await loadIssue(issueId.parse(id));
  if (!issue || issue.finalized_at) return { ok: false, message: "This issue is already final." };
  const missing = missingItems(issue);
  if (missing.length) return { ok: false, message: `Still missing: ${missing.join("; ")}.` };
  const built = await buildPdf(issue, "final");
  if (!built) return { ok: false, message: BUILD_FAILED };

  const admin = createAdminClient();
  const finalPdfPath = `${issue.id}/final/${crypto.randomUUID()}.pdf`;
  const upload = await admin.storage.from(NU_NEWS_BUCKET).upload(finalPdfPath, built.pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error) return { ok: false, message: "The final PDF could not be stored. Try again." };

  const photoChecksums = Object.fromEntries([...built.photos].map(([src, bytes]) => [src, sha256(bytes)]));
  const finalized = await admin
    .from("nu_news_issues")
    .update({
      finalized_at: new Date().toISOString(),
      finalized_by: finalizer.userId,
      finalized_by_name: finalizer.name,
      final_pdf_path: finalPdfPath,
      final_pdf_sha256: sha256(built.pdf),
      final_inputs: { ...newsletterInput(issue), draft: false, photos: photoChecksums },
    })
    .eq("id", issue.id)
    .eq("updated_at", issue.updated_at)
    .select("id");
  if (finalized.error || !finalized.data.length) {
    return { ok: false, message: "The issue changed while it was being finalized. Review it and try again." };
  }
  return { ok: true };
}
