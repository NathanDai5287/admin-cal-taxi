import Link from "next/link";

import { Button } from "@/components/brand/button";
import { createIssue } from "@/app/(admin)/nu-news/actions";
import { listIssues } from "@/lib/nu-news/store";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { formatReimbursementDate } from "@/lib/reimbursements/format";

export const dynamic = "force-dynamic";

export default async function NuNewsPage() {
  await requireAdmin("/");
  const issues = await listIssues();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Nu News</h1>
          <p className="page-lede">Enter each semester’s newsletter, check the preview, then finalize it. A final issue and its PDF never change.</p>
        </div>
        <form action={createIssue}>
          <Button type="submit">New issue</Button>
        </form>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Issues</h2>
        </div>
        {issues.length === 0 ? (
          <p className="card-body m-0 border-t border-rule pt-5 text-[13.5px] text-muted">No issues yet. Select New issue to start the first one.</p>
        ) : (
          <div className="table-scroll border-t border-rule">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td><Link className="font-bold text-brand" href={`/nu-news/${issue.id}`}>{issue.season}</Link></td>
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
