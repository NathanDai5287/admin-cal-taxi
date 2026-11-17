"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/brand/button";
import { getDuesEmails } from "./email-actions";

function emailTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(value));
}

export function DuesEmailHistory({ chargeId }: { chargeId: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getDuesEmails>> | null>(null);
  const [pending, startTransition] = useTransition();
  const load = useCallback(async () => setResult(await getDuesEmails(chargeId)), [chargeId]);
  useEffect(() => { startTransition(load); }, [load, startTransition]);

  return <section aria-label="Email history" aria-busy={pending}>
    <h3 className="text-base font-semibold text-ink">Emails for this charge</h3>
    <p className="mt-2 text-sm text-muted">New payment confirmations appear here. Earlier emails may not have a saved record.</p>
    {!result && <p className="mt-5 text-sm text-muted" role="status">Loading emails…</p>}
    {result?.error && <div className="mt-5 grid justify-items-start gap-3"><p className="text-sm text-warn" role="alert">{result.error}</p><Button compact variant="secondary" disabled={pending} onClick={() => startTransition(load)}>Try again</Button></div>}
    {result?.messages?.length === 0 && <p className="mt-5 text-sm text-muted">No emails recorded for this charge.</p>}
    {result?.messages?.map((message) => <article key={message.id} className="border-b border-rule py-6 last:border-b-0">
      <h4 className="break-words text-base font-semibold text-ink">{message.subject}</h4>
      <p className="mt-1 break-all text-sm text-muted">To {message.recipient}</p>
      {message.sentAt ? <p className="mt-2 text-sm text-muted">Sent <time dateTime={message.sentAt}>{emailTime(message.sentAt)}</time></p>
        : <p className="mt-2 text-sm text-warn">{message.error ? `Delivery has not been confirmed. ${message.error}` : "Delivery has not been confirmed."}</p>}
      <details className="mt-3">
        <summary className="w-fit cursor-pointer py-3 text-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">View email</summary>
        <p className="mt-2 whitespace-pre-wrap break-words border-t border-rule pt-4 text-sm leading-relaxed text-ink">{message.text}</p>
      </details>
    </article>)}
  </section>;
}
