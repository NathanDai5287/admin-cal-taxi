"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  DEFAULT_DONATE, NU_NEWS_BUCKET, canPreview, issueSchema, missingItems, photoSources, previewPath, type NuNewsIssue,
} from "@/lib/nu-news/issue";
import { newsletterInput, renderNuNewsPdf } from "@/lib/nu-news/pdf";
import { loadIssue } from "@/lib/nu-news/store";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { userLabel } from "@/lib/reimbursements/user-label";

// Layouts don't wrap server-action POSTs — every action must check the role.

type ActionResult<Success = object> = ({ ok: true } & Success) | { ok: false; message: string };

const issueId = z.uuid();
const IMMUTABLE = "22023";
const BUILD_FAILED = "The PDF could not be made. Upload any missing photos again, then try again.";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function currentSeason(today = new Date()) {
  return `${today.getMonth() >= 6 ? "Fall" : "Spring"} ${today.getFullYear()}`;
}

export async function createIssue() {
  await requireAdmin("/");
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
    .insert({ season: currentSeason(), location: previous.data?.location, donate: previous.data?.donate ?? DEFAULT_DONATE })
    .select("id")
    .single();
  if (created.error) throw new Error(`Unable to create a Nu News issue: ${created.error.message}`);

  revalidatePath("/nu-news");
  redirect(`/nu-news/${created.data.id}`);
}

export async function saveIssue(id: string, issue: NuNewsIssue): Promise<ActionResult> {
  await requireAdmin("/");
  const parsed = issueSchema.safeParse(issue);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { error } = await createAdminClient().from("nu_news_issues").update(parsed.data).eq("id", issueId.parse(id));
  if (error?.code === IMMUTABLE) return { ok: false, message: "This issue is final and can no longer change." };
  if (error) return { ok: false, message: "The issue could not be saved. Try again." };

  revalidatePath("/nu-news", "layout");
  return { ok: true };
}

export async function preparePhotoUpload(id: string): Promise<ActionResult<{ path: string; token: string }>> {
  await requireAdmin("/");
  const { data, error } = await createAdminClient()
    .storage.from(NU_NEWS_BUCKET)
    .createSignedUploadUrl(`${issueId.parse(id)}/${crypto.randomUUID()}.jpg`);
  if (error) return { ok: false, message: "The photo upload could not be prepared. Try again." };
  return { ok: true, path: data.path, token: data.token };
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
    return { photos, pdf: renderNuNewsPdf(issue, photos, mark) };
  } catch (error) {
    console.error("Nu News PDF generation failed", error);
    return null;
  }
}

export async function makePreview(id: string): Promise<ActionResult<{ madeAt: string }>> {
  await requireAdmin("/");
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

  return { ok: true, madeAt };
}

export async function finalizeIssue(id: string): Promise<ActionResult> {
  const { userId, email, profile } = await requireAdmin("/");
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
      finalized_by: userId,
      finalized_by_name: userLabel(profile.full_name, email),
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

  revalidatePath("/nu-news", "layout");
  return { ok: true };
}
