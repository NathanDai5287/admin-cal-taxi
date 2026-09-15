"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SubmitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Member reimbursement page failed", error);
  }, [error]);

  return (
    <section className="card p-6" role="alert">
      <h1 className="page-title">We couldn’t load this page</h1>
      <p className="my-4 text-sm text-muted">
        Your account and reimbursement data have not been changed. Try loading
        the page again, or return to the reimbursement form.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <button className="text-brand underline" onClick={reset} type="button">
          Try again
        </button>
        <Link className="text-brand underline" href="/">
          Return to reimbursements
        </Link>
      </div>
    </section>
  );
}
