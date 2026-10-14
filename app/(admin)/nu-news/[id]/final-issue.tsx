import Link from "next/link";

import type { NuNewsIssue } from "@/lib/nu-news/issue";
import { formatReimbursementDate } from "@/lib/reimbursements/format";

import { Section } from "./field";
import { Thumbnail } from "./photo-field";

type FinalIssueProps = {
  issueId: string;
  issue: NuNewsIssue;
  photoUrls: Record<string, string>;
  finalizedAt: string;
  finalizedBy: string;
};

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="field-label">{label}</span>
      <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function FinalIssue({ issueId, issue, photoUrls, finalizedAt, finalizedBy }: FinalIssueProps) {
  const photo = (src: string | null) => (src ? photoUrls[src] : undefined);

  return (
    <div className="grid gap-6">
      <div>
        <Link className="back-link" href="/nu-news">← All issues</Link>
        <h1 className="page-title">{issue.season}</h1>
        <p className="page-lede">This issue is final. Its text, photos, and PDF can no longer change.</p>
      </div>

      <div className="card-plain flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="m-0 flex flex-wrap items-center gap-3 text-[13.5px]">
          <span className="badge badge-approved">Final</span>
          Finalized by {finalizedBy} on {formatReimbursementDate(finalizedAt, true)}
        </p>
        <a className="brand-button btn-primary" href={`/nu-news/${issueId}/pdf`}>Download PDF</a>
      </div>

      <Section title="Issue details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Value label="Season">{issue.season}</Value>
          <Value label="Issue date">{formatReimbursementDate(issue.issue_date)}</Value>
          <Value label="Location">{issue.location}</Value>
        </div>
      </Section>

      <Section title="Cover">
        <Thumbnail src={photo(issue.cover_src)} alt="Title photo" className="h-48 w-72 border border-rule" />
        <Value label="Intro heading">{issue.intro.heading}</Value>
        <Value label="Intro text">{issue.intro.body}</Value>
      </Section>

      <Section title="Articles">
        {issue.articles.map((article) => (
          <article key={article.id} className="card-plain grid gap-4 p-5">
            <div className="flex items-center gap-4">
              <Thumbnail src={photo(article.headshot)} alt={`${article.author} headshot`} className="h-24 w-20 border border-rule" />
              <div>
                <h3 className="m-0 text-[17px] font-bold text-ink">{article.title}</h3>
                <p className="m-0 mt-1 text-[13px] text-muted">{article.author} · {article.roster}</p>
              </div>
            </div>
            <Value label="Article text">{article.body}</Value>
            <Value label="Sign-off">{article.closing}</Value>
          </article>
        ))}
      </Section>

      <Section title="Photos">
        <ol className="m-0 grid list-none gap-3 p-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {issue.gallery.map((galleryPhoto, index) => (
            <li key={galleryPhoto.src} className="grid gap-1">
              <Thumbnail src={photo(galleryPhoto.src)} alt={`Gallery photo ${index + 1}`} className="aspect-[4/3] w-full" />
              <span className="text-[12px] text-muted">
                {[String(index + 1), galleryPhoto.feature && "Full width", galleryPhoto.donate && "Donate photo"].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="How to donate">
        <Value label="Heading">{issue.donate.heading}</Value>
        <Value label="Text">{issue.donate.body}</Value>
      </Section>
    </div>
  );
}
