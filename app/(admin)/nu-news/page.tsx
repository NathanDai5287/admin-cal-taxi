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

  return (
    <div className="grid gap-8">
      <div className="nu-news-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Nu News</h1>
          <p className="page-lede">{canWrite ? "Enter each semester’s newsletter, check the preview, then finalize it. A final issue and its PDF never change." : "Read the completed Nu News PDF for each semester."}</p>
        </div>
        {canWrite && <form action={createIssue} className="nu-news-create">
          <Button type="submit">New issue</Button>
        </form>}
      </div>

      <section className="nu-news-archive" aria-labelledby="issues-heading">
        <div className="nu-news-archive-header">
          <h2 id="issues-heading">Issues</h2>
          <span className="nu-news-count">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span>
        </div>
        {issues.length === 0 ? (
          <p className="nu-news-empty">{canWrite ? "No issues yet. Select New issue to start the first one." : "No completed issues yet."}</p>
        ) : (
          <div className="table-scroll border-t border-rule">
            <table className="data-table nu-news-table">
              <thead>
                <tr>
                  <th scope="col">Semester + year</th>
                  {canWrite && <th scope="col">Date</th>}
                  <th scope="col">{canWrite ? "Status" : "PDF"}</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td><Link className="nu-news-issue-link" href={`/nu-news/${issue.id}`}>{issue.season}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></Link></td>
                    {canWrite && <td>{formatReimbursementDate(issue.issue_date)}</td>}
                    <td>{canWrite ? (issue.finalized_at ? <span className="badge badge-approved">Final</span> : <span className="badge">Draft</span>) : <a className="text-brand underline" href={`/nu-news/${issue.id}/pdf`} aria-label={`Download ${issue.season} PDF`}>Download PDF</a>}</td>
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
