"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createDraft, finalizeDraft, makeDraftPreview, saveDraft, type ActionResult } from "@/lib/nu-news/drafts";
import { NU_NEWS_BUCKET, photoPath, type NuNewsIssue } from "@/lib/nu-news/issue";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { userLabel } from "@/lib/reimbursements/user-label";

// Layouts don't wrap server-action POSTs — every action must check the role.

export async function createIssue() {
  await requireAdmin("/");
  const id = await createDraft();
  revalidatePath("/nu-news");
  redirect(`/nu-news/${id}`);
}

export async function saveIssue(id: string, issue: NuNewsIssue): Promise<ActionResult> {
  await requireAdmin("/");
  const result = await saveDraft(id, issue);
  if (result.ok) revalidatePath("/nu-news", "layout");
  return result;
}

export async function preparePhotoUpload(id: string): Promise<ActionResult<{ path: string; token: string }>> {
  await requireAdmin("/");
  const { data, error } = await createAdminClient()
    .storage.from(NU_NEWS_BUCKET)
    .createSignedUploadUrl(photoPath(z.uuid().parse(id), crypto.randomUUID()));
  if (error) return { ok: false, message: "The photo upload could not be prepared. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

export async function makePreview(id: string) {
  await requireAdmin("/");
  return makeDraftPreview(id);
}

export async function finalizeIssue(id: string): Promise<ActionResult> {
  const { userId, email, profile } = await requireAdmin("/");
  const result = await finalizeDraft(id, { userId, name: userLabel(profile.full_name, email) });
  if (result.ok) revalidatePath("/nu-news", "layout");
  return result;
}
