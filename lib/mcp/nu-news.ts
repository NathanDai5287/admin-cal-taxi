import "server-only";

import {
  FINAL_ISSUE, createDraft, finalizeDraft, makeDraftPreview, saveDraft, type Finalizer, type NewIssueDetails,
} from "@/lib/nu-news/drafts";
import {
  CENTER_FOCUS, HEADSHOT_FOCUS, NU_NEWS_BUCKET, missingItems, newArticle, photoPath, photoSources, updateGalleryPhoto,
  type Focus, type NuNewsArticle, type NuNewsGalleryPhoto, type NuNewsIssue, type NuNewsPhoto,
} from "@/lib/nu-news/issue";
import { moved } from "@/lib/nu-news/moved";
import { loadIssue, pdfUrl, photoUrls, type StoredIssue } from "@/lib/nu-news/store";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { userLabel } from "@/lib/reimbursements/user-label";

import { checkNuNewsPhoto } from "./nu-news-photo";

export const MCP_LINK_SECONDS = 600;
export const UPLOAD_LINK_SECONDS = 2 * 60 * 60;

type Position = { position?: number };
type ArticleChanges = Partial<Omit<NuNewsArticle, "id">> & Position;
type GalleryChanges = Partial<Pick<NuNewsGalleryPhoto, "feature" | "donate">> & Position;

export const issueStatus = (issue: { finalized_at: string | null }) => (issue.finalized_at ? "final" : "draft");

const issueView = (issue: StoredIssue) => ({ ...issue, status: issueStatus(issue), missingItems: missingItems(issue) });

async function loadExistingIssue(issueId: string) {
  const issue = await loadIssue(issueId);
  if (!issue) throw new Error("No Nu News issue has that ID.");
  return issue;
}

async function loadDraft(issueId: string) {
  const issue = await loadExistingIssue(issueId);
  if (issue.finalized_at) throw new Error(FINAL_ISSUE);
  return issue;
}

async function save(issueId: string, issue: NuNewsIssue) {
  const result = await saveDraft(issueId, issue);
  if (!result.ok) throw new Error(result.message);
  return { issueId, missingItems: missingItems(issue) };
}

export async function createIssue(requestId: string, details: Omit<NewIssueDetails, "id">) {
  const retried = await loadIssue(requestId);
  const issueId = retried?.id ?? await createDraft({ ...details, id: requestId });
  return issueView(await loadExistingIssue(issueId));
}

export async function editDraft(issueId: string, change: (issue: NuNewsIssue) => NuNewsIssue) {
  return save(issueId, change(await loadDraft(issueId)));
}

export const curlUpload = (uploadUrl: string) => (
  `curl -sS --fail-with-body -X PUT -H 'content-type: image/jpeg' --data-binary @photo.jpg '${uploadUrl}'`
);

export async function preparePhotoUpload(issueId: string, requestId: string) {
  await loadDraft(issueId);
  const path = photoPath(issueId, requestId);
  const { data, error } = await createAdminClient().storage.from(NU_NEWS_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`The upload could not be prepared. If you already uploaded a photo with this requestId, use path ${path}; otherwise try again.`);
  return {
    path,
    uploadUrl: data.signedUrl,
    token: data.token,
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    expiresInSeconds: UPLOAD_LINK_SECONDS,
    curlExample: curlUpload(data.signedUrl),
  };
}

const isUploadOf = (issueId: string, path: string) => new RegExp(`^${issueId}/[0-9a-f-]{36}\\.jpg$`, "i").test(path);

async function checkUploadedPhoto(path: string) {
  const storage = createAdminClient().storage.from(NU_NEWS_BUCKET);
  const { data, error } = await storage.download(path);
  if (error) throw new Error("No photo is uploaded at this path. Upload it to the uploadUrl from prepare_nu_news_photo_upload first.");
  try {
    checkNuNewsPhoto(Buffer.from(await data.arrayBuffer()));
  } catch (refusal) {
    await storage.remove([path]);
    throw refusal;
  }
}

export async function addDraftPhoto(issueId: string, path: string, place: (issue: NuNewsIssue, src: string) => NuNewsIssue) {
  if (!isUploadOf(issueId, path)) throw new Error("This is not a photo path of this issue. Use the path from prepare_nu_news_photo_upload.");
  const placed = place(await loadDraft(issueId), path);
  await checkUploadedPhoto(path);
  return { src: path, ...await save(issueId, placed) };
}

function articleIndex(issue: NuNewsIssue, articleId: string) {
  const index = issue.articles.findIndex((article) => article.id === articleId);
  if (index < 0) throw new Error("This issue has no article with that ID.");
  return index;
}

function galleryIndex(issue: NuNewsIssue, src: string) {
  const index = issue.gallery.findIndex((photo) => photo.src === src);
  if (index < 0) throw new Error("This issue has no gallery photo with that src.");
  return index;
}

const placedAt = <Item>(items: Item[], index: number, position: number | undefined) => (
  position === undefined ? items : moved(items, index, position - 1 - index)
);

export function withNewArticle(issue: NuNewsIssue, articleId: string, fields: Omit<ArticleChanges, "headshot" | "position">) {
  const retried = issue.articles.some((article) => article.id === articleId);
  return retried ? issue : { ...issue, articles: [...issue.articles, { ...newArticle(articleId), ...fields }] };
}

export function withArticleChanges(issue: NuNewsIssue, articleId: string, { position, ...changes }: ArticleChanges) {
  const index = articleIndex(issue, articleId);
  const articles = issue.articles.map((article, i) => (i === index ? { ...article, ...changes } : article));
  return { ...issue, articles: placedAt(articles, index, position) };
}

export function withoutArticle(issue: NuNewsIssue, articleId: string) {
  const index = articleIndex(issue, articleId);
  return { ...issue, articles: issue.articles.filter((_, i) => i !== index) };
}

export const withTitlePhoto = (issue: NuNewsIssue, src: string) => ({ ...issue, cover: { src, focus: CENTER_FOCUS } });

export const withHeadshot = (issue: NuNewsIssue, articleId: string, src: string) => (
  withArticleChanges(issue, articleId, { headshot: { src, focus: HEADSHOT_FOCUS } })
);

export function withGalleryPhoto(issue: NuNewsIssue, src: string) {
  const retried = issue.gallery.some((photo) => photo.src === src);
  return retried ? issue : { ...issue, gallery: [...issue.gallery, { src, focus: CENTER_FOCUS, feature: false, donate: false }] };
}

export function withGalleryChanges(issue: NuNewsIssue, src: string, { position, ...changes }: GalleryChanges) {
  const index = galleryIndex(issue, src);
  return { ...issue, gallery: placedAt(updateGalleryPhoto(issue.gallery, index, changes), index, position) };
}

export function withoutGalleryPhoto(issue: NuNewsIssue, src: string) {
  const index = galleryIndex(issue, src);
  return { ...issue, gallery: issue.gallery.filter((_, i) => i !== index) };
}

export function withFocus(issue: NuNewsIssue, src: string, focus: Focus): NuNewsIssue {
  if (!photoSources(issue).includes(src)) throw new Error("This issue has no photo with that src.");
  const focused = <Photo extends NuNewsPhoto>(photo: Photo) => (photo.src === src ? { ...photo, focus } : photo);
  return {
    ...issue,
    cover: issue.cover && focused(issue.cover),
    articles: issue.articles.map((article) => ({ ...article, headshot: article.headshot && focused(article.headshot) })),
    gallery: issue.gallery.map(focused),
  };
}

export async function previewDraft(issueId: string) {
  const result = await makeDraftPreview(issueId);
  if (!result.ok) throw new Error(result.message);
  const issue = await loadExistingIssue(issueId);
  return {
    issueId,
    previewMadeAt: result.madeAt,
    previewPdfUrl: await pdfUrl(issue, MCP_LINK_SECONDS),
    photoWarnings: result.warnings,
    missingItems: missingItems(issue),
  };
}

export async function finalizerFor(userId: string): Promise<Finalizer> {
  const { data, error } = await createAdminClient().from("profiles").select("full_name, email").eq("id", userId).single();
  if (error) throw new Error("Your administrator profile could not be loaded.");
  return { userId, name: userLabel(data.full_name, data.email) };
}

export async function finalizeConfirmedDraft(issueId: string, confirmSeason: string, finalizer: Finalizer) {
  const draft = await loadDraft(issueId);
  if (confirmSeason !== draft.season) throw new Error("confirmSeason must match the issue's season exactly.");
  const result = await finalizeDraft(issueId, finalizer);
  if (!result.ok) throw new Error(result.message);

  const issue = await loadExistingIssue(issueId);
  return {
    issueId,
    status: issueStatus(issue),
    finalizedAt: issue.finalized_at,
    finalizedBy: issue.finalized_by_name,
    finalPdfSha256: issue.final_pdf_sha256,
    finalPdfUrl: await pdfUrl(issue, MCP_LINK_SECONDS),
  };
}

export async function pdfLink(issueId: string) {
  const issue = await loadExistingIssue(issueId);
  const url = await pdfUrl(issue, MCP_LINK_SECONDS);
  if (!url) throw new Error("This issue has no PDF yet. Make a preview first.");
  return { issueId, status: issueStatus(issue), pdfUrl: url };
}

export async function issueWithPhotoLinks(issueId: string) {
  const issue = await loadExistingIssue(issueId);
  const urls = await photoUrls(photoSources(issue), MCP_LINK_SECONDS);
  const linked = <Photo extends NuNewsPhoto>(photo: Photo) => ({ ...photo, viewUrl: urls[photo.src] });
  return {
    ...issueView(issue),
    cover: issue.cover && linked(issue.cover),
    articles: issue.articles.map((article) => ({ ...article, headshot: article.headshot && linked(article.headshot) })),
    gallery: issue.gallery.map(linked),
  };
}
