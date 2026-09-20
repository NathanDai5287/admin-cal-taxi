"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SubmissionError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Accreditation submission page failed", error);
  }, [error]);

  return (
    <div className="space-y-7">
      <section>
        <h1 className="page-title">This submission could not be loaded</h1>
        <p className="page-lede">Your saved submission is still available. Retry the request, or return to the workspace and open it again.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-action-hover" onClick={retry}>Try again</button>
        <Link className="border border-rule bg-surface px-5 py-3 text-sm font-bold text-brand hover:border-brand" href="/accreditation">Back to submissions</Link>
      </div>
    </div>
  );
}
