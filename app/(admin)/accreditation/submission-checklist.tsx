"use client";

import { useState, useTransition } from "react";

import { SUBMISSION_CHECKLIST_REPORTS, SUBMISSION_CHECKLIST_YEAR } from "@/lib/accreditation/submission-checklist";
import { setAccreditationReportSubmitted } from "./checklist-actions";

type Report = (typeof SUBMISSION_CHECKLIST_REPORTS)[number];

function ChecklistRow({ report, submitted, editable }: { report: Report; submitted: boolean; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(nextSubmitted: boolean) {
    if (pending) return;

    setError(null);
    startTransition(async () => {
      try {
        const result = await setAccreditationReportSubmitted(report.key, nextSubmitted);
        setError(result.error);
      } catch {
        setError("Couldn’t save this checkmark. Try again.");
      }
    });
  }

  return (
    <li className="break-inside-avoid border-b border-rule">
      <label className={`flex min-h-11 items-center gap-3 px-2 py-2 text-sm ${editable && !pending ? "cursor-pointer hover:bg-canvas" : ""}`}>
        <input
          type="checkbox"
          className="checkbox-brand shrink-0"
          checked={submitted}
          disabled={!editable}
          aria-disabled={pending || undefined}
          aria-labelledby={`checklist-report-${report.key}`}
          onChange={(event) => update(event.currentTarget.checked)}
        />
        <span id={`checklist-report-${report.key}`} className="flex-1">{report.title}</span>
        {pending && <span className="text-xs text-muted" role="status">Saving…</span>}
      </label>
      {error && <p className="px-2 pb-2 text-sm text-muted" role="alert">{error}</p>}
    </li>
  );
}

export function SubmissionChecklist({ submittedKeys, editable, unavailable }: { submittedKeys: string[]; editable: boolean; unavailable: boolean }) {
  const submitted = new Set(submittedKeys);
  const total = SUBMISSION_CHECKLIST_REPORTS.length;
  const count = SUBMISSION_CHECKLIST_REPORTS.filter((report) => submitted.has(report.key)).length;

  return (
    <section aria-labelledby="submission-checklist-title" className="card">
      <div className="card-header flex-wrap justify-between gap-y-2">
        <h2 id="submission-checklist-title" className="text-lg font-bold">{SUBMISSION_CHECKLIST_YEAR.replace("-", "–")} submission checklist</h2>
        {!unavailable && <p className="text-sm font-semibold tabular-nums text-muted" role="status">{count} of {total} submitted</p>}
      </div>
      <div className="card-body border-t border-rule pt-3">
        {unavailable ? (
          <p className="mb-3 text-sm text-muted" role="alert">Saved checkmarks couldn’t be loaded. Refresh the page to try again.</p>
        ) : editable && (
          <p className="mb-3 text-sm text-muted">Check off each report after submitting it.</p>
        )}
        <ul className="border-t border-rule md:columns-2 md:gap-8">
          {SUBMISSION_CHECKLIST_REPORTS.map((report) => (
            <ChecklistRow key={report.key} report={report} submitted={submitted.has(report.key)} editable={editable && !unavailable} />
          ))}
        </ul>
      </div>
    </section>
  );
}
