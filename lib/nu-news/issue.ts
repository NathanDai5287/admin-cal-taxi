import { CHAPTER_ZELLE_EMAIL, FOUNDATION_CONTACT_EMAIL } from "../chapter-contacts";
import { z } from "zod";

export const NU_NEWS_BUCKET = "nu-news";

export const DEFAULT_DONATE = {
  heading: "HOW TO DONATE",
  body: [
    `Donations directly to the Nu Chapter, a 501(c)(7) organization, can be made through Zelle at the following account: ${CHAPTER_ZELLE_EMAIL}`,
    `Tax deductible donations can be made to the Theta Xi Foundation, a 501(c)(3) organization, contact ${FOUNDATION_CONTACT_EMAIL} or go to ThetaXi.org and click on “Give,” for more information`,
  ].join("\n"),
};

export type Focus = [x: number, y: number];
export const CENTER_FOCUS: Focus = [0.5, 0.5];
export const HEADSHOT_FOCUS: Focus = [0.5, 0.4];
export const PHOTO_LONG_EDGE_PX = 2_200;

const fraction = z.number().min(0).max(1);
const photo = z.object({
  src: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/),
  focus: z.tuple([fraction, fraction]),
});

export const issueSchema = z.object({
  season: z.string().trim().min(1, "Enter the season, for example Fall 2026.").max(60),
  issue_date: z.iso.date("Choose the issue date."),
  location: z.string().max(80),
  intro: z.object({ heading: z.string().max(120), body: z.string().max(5_000) }),
  articles: z.array(z.object({
    id: z.uuid(),
    title: z.string().max(200),
    author: z.string().max(120),
    roster: z.string().max(60),
    body: z.string().max(40_000),
    closing: z.string().max(1_000),
    headshot: photo.nullable(),
  })).max(12),
  cover: photo.nullable(),
  gallery: z.array(photo.extend({ feature: z.boolean(), donate: z.boolean() })).max(80),
  donate: z.object({ heading: z.string().max(120), body: z.string().max(3_000) }),
});

export type NuNewsIssue = z.infer<typeof issueSchema>;
export type NuNewsArticle = NuNewsIssue["articles"][number];
export type NuNewsPhoto = z.infer<typeof photo>;
export type NuNewsGalleryPhoto = NuNewsIssue["gallery"][number];

export const previewPath = (issueId: string) => `${issueId}/preview.pdf`;
export const photoPath = (issueId: string, photoId: string) => `${issueId}/${photoId}.jpg`;

export const newArticle = (id: string): NuNewsArticle => ({ id, title: "", author: "", roster: "", body: "", closing: "YITB,", headshot: null });

export function updateGalleryPhoto(gallery: NuNewsGalleryPhoto[], index: number, changes: Partial<NuNewsGalleryPhoto>) {
  const onlyDonatePhoto = changes.donate === true;
  return gallery.map((photo, i) => {
    if (i === index) return { ...photo, ...changes };
    return onlyDonatePhoto ? { ...photo, donate: false } : photo;
  });
}

export function pdfFileName(season: string) {
  return `nu-news-${season.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

export function photoSources(issue: NuNewsIssue) {
  return [issue.cover, ...issue.articles.map((article) => article.headshot), ...issue.gallery]
    .filter((photo) => photo !== null)
    .map((photo) => photo.src);
}

export function canPreview(issue: NuNewsIssue) {
  return Boolean(issue.cover) && issue.articles.every((article) => article.headshot);
}

function missingInArticle(article: NuNewsArticle, index: number) {
  const name = article.author.trim() || `Article ${index + 1}`;
  return [
    !article.author.trim() && `Article ${index + 1} has no author`,
    !article.title.trim() && `${name} has no title`,
    !article.headshot && `${name} has no headshot`,
    !article.body.trim() && `${name} has no text`,
  ];
}

export function missingItems(issue: NuNewsIssue) {
  return [
    !issue.cover && "No title photo",
    !issue.intro.heading.trim() && "No intro heading",
    !issue.intro.body.trim() && "No intro text",
    !issue.articles.length && "No articles",
    ...issue.articles.flatMap(missingInArticle),
    !issue.donate.body.trim() && "No donation text",
  ].filter((item): item is string => Boolean(item));
}
