import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublishedIssue } from "@/lib/nu-news/publication";
import { newsletterUrl } from "@/lib/mailing-list/broadcast";
import styles from "./newsletter.module.css";
import { ReaderTracking } from "./reader-tracking";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ broadcast?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const issue = await loadPublishedIssue(id);
  if (!issue) return { title: "Newsletter unavailable" };
  return { title: `Nu News · ${issue.season}`, description: "News and stories from Theta Xi Nu Chapter at UC Berkeley.", alternates: { canonical: newsletterUrl(id) } };
}

export default async function NewsletterPage({ params, searchParams }: Props) {
  const { id } = await params;
  const issue = await loadPublishedIssue(id);
  if (!issue) notFound();
  const date = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${issue.issue_date}T12:00:00Z`));
  const source = (await searchParams).broadcast;
  const broadcastId = z.uuid().safeParse(source).success ? source! : null;
  const query = broadcastId ? `?broadcast=${broadcastId}` : "";
  const pdf = `/news/${id}/pdf${query}`;
  return <main id="main-content" className={styles.page}>
    <ReaderTracking issueId={id} broadcastId={broadcastId} />
    <header className={styles.heading}><div><h1>Nu News</h1><p>{issue.season} <span aria-hidden="true">·</span> {date}</p></div><a className={styles.download} href={`${pdf}${query ? "&" : "?"}download=1`}>Download the newsletter <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg></a></header>
    <section className={styles.reader} aria-label={`${issue.season} newsletter PDF`}><iframe title={`Nu News — ${issue.season}`} src={`${pdf}${query ? "&" : "?"}embedded=1`} /><p>Prefer your own reader? <a href={pdf} target="_blank" rel="noreferrer">Open the PDF in a new tab</a>.</p></section>
    <section className={styles.stories} aria-labelledby="stories-heading"><h2 id="stories-heading">In this issue</h2><p className={styles.intro}>{issue.intro.heading}</p><p className={styles.text}>{issue.intro.body}</p>{issue.articles.map((article) => <article key={article.id}><h3>{article.title}</h3><p className={styles.byline}>{article.author}{article.roster ? ` · ${article.roster}` : ""}</p><div className={styles.text}>{article.body}</div><p className={styles.text}>{article.closing}</p></article>)}</section>
  </main>;
}
