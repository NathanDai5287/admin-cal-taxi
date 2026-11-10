import Link from "next/link";

type FinalIssueProps = {
  issueId: string;
  season: string;
  pdfSrc: string | null;
};

export function FinalIssue({ issueId, season, pdfSrc }: FinalIssueProps) {
  return (
    <div className="grid gap-6">
      <div className="nu-news-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="back-link" href="/nu-news">← All issues</Link>
          <h1 className="page-title">{season}</h1>
        </div>
        <a className="brand-button btn-primary" href={`/nu-news/${issueId}/pdf`}>Download PDF</a>
      </div>
      {pdfSrc ? (
        <object className="h-[75vh] min-h-[480px] w-full border border-rule bg-surface" data={pdfSrc} type="application/pdf" aria-label={`${season} Nu News PDF`}>
          <p className="p-5">To read this issue, <a className="text-brand underline" href={pdfSrc}>open the PDF</a> or download it above.</p>
        </object>
      ) : (
        <p className="nu-news-empty">The completed PDF is unavailable. Please try again later.</p>
      )}
    </div>
  );
}
