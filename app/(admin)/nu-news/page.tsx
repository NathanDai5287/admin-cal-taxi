import Link from "next/link";

import { Button } from "@/components/brand/button";
import { createIssue } from "@/app/(admin)/nu-news/actions";
import { listIssues } from "@/lib/nu-news/store";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { formatReimbursementDate } from "@/lib/reimbursements/format";

export const dynamic = "force-dynamic";

export default async function NuNewsPage() {
  const session = await requireAppAccess("nu-news");
  const canWrite = session.appAccess["nu-news"] === "write";
  const allIssues = await listIssues();
  const issues = canWrite ? allIssues : allIssues.filter((issue) => issue.finalized_at);

  if (!canWrite) {
    return (
      <div className="nu-news-directory">
        <header className="nu-news-directory-heading">
          <h1 className="page-title">Nu News</h1>
          <p className="page-lede">The Nu Chapter newsletter.</p>
        </header>
        {issues.length === 0 ? (
          <p className="nu-news-empty">No completed issues yet.</p>
        ) : (
          <ul className="nu-news-issue-list" aria-label="Newsletter issues">
            {issues.map((issue) => (
              <li key={issue.id} className="nu-news-issue-row">
                <a className="nu-news-read-issue" href={`/nu-news/${issue.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${issue.season} PDF in a new tab`}>
                  <span className="nu-news-issue-season">{issue.season}</span>
                  <span className="nu-news-open-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" /></svg>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="nu-news-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Nu News</h1>
          <p className="page-lede">Enter each semester’s newsletter, check the preview, then finalize it. A final issue and its PDF never change.</p>
        </div>
        <form action={createIssue} className="nu-news-create">
          <Button type="submit">New issue</Button>
        </form>
      </div>

      <section className="nu-news-archive" aria-labelledby="issues-heading">
        <div className="nu-news-archive-header">
          <h2 id="issues-heading">Issues</h2>
          <span className="nu-news-count">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span>
        </div>
        {issues.length === 0 ? (
          <p className="nu-news-empty">No issues yet. Select New issue to start the first one.</p>
        ) : (
          <div className="table-scroll border-t border-rule">
            <table className="data-table nu-news-table">
              <thead>
                <tr>
                  <th scope="col">Issue</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td><Link className="nu-news-issue-link" href={`/nu-news/${issue.id}`}>{issue.season}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></Link></td>
                    <td>{formatReimbursementDate(issue.issue_date)}</td>
                    <td>{issue.finalized_at ? <span className="badge badge-approved">Final</span> : <span className="badge">Draft</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
