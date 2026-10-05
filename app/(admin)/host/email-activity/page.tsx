import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { getSessionProfile } from "@/lib/reimbursements/auth";

import { emailTrackingEnabled, loadEmailActivity, type EmailActivity } from "@/lib/email-tracking";

export const metadata: Metadata = { title: "Email activity" };
export const dynamic = "force-dynamic";

function activityTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function EmailRecord({ message }: { message: EmailActivity }) {
  const opens = message.events.filter(event => event.kind === "opened").length;
  const clicks = message.events.filter(event => event.kind === "clicked").length;

  return (
    <article className="border-b border-rule py-6 last:border-b-0">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
        <h2 className="break-words text-base font-semibold text-ink">{message.subject}</h2>
        <p className="mt-1 break-all text-sm text-muted">{message.recipient}</p>
        <p className="mt-2 text-sm text-muted">
          Sent <time dateTime={message.sent_at ?? message.created_at}>{activityTime(message.sent_at ?? message.created_at)}</time>
        </p>
        {message.kind === "hosting" && message.related_id && (
          <Link href={`/host/orders/${message.related_id}`} className="mt-2 inline-block py-2 text-sm text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">View order</Link>
        )}
        </div>
        <dl className="flex gap-6 text-sm sm:text-right">
          <div><dt className="text-muted">Recorded opens</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{opens}</dd></div>
          <div><dt className="text-muted">Link visits</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{clicks}</dd></div>
        </dl>
      </div>
      <details className="mt-3">
        <summary className="w-fit cursor-pointer py-3 text-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">View activity ({message.events.length})</summary>
        {message.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="mt-2 grid gap-4 border-t border-rule pt-4">
            {message.events.map((event, index) => (
              <li key={`${event.occurred_at}-${index}`} className="text-sm">
                <span>{event.kind === "opened" ? "Open observed" : "Link visited"}</span>
                <time className="mt-1 block text-muted tabular-nums sm:ml-2 sm:mt-0 sm:inline" dateTime={event.occurred_at}>{activityTime(event.occurred_at)}</time>
                {event.url && <p className="mt-1 break-all text-muted">{event.url}</p>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}

export default async function EmailActivityPage({ searchParams }: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/");
  if (session.profile.role !== "admin") {
    return <AccessDenied showSubmitLink={session.profile.role === "member"} />;
  }
  const { order } = await searchParams;
  const messages = await loadEmailActivity(order);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Email activity</h1>
        <p className="page-lede">See recorded opens and link visits for the latest 100 sent emails.</p>
        <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted">
          Email apps can load images automatically or block them. Security checks can visit links automatically. Activity does not prove someone read an email.
        </p>
        <p className="mt-2 text-sm text-muted">Times use Pacific time. Group emails cannot identify which recipient acted.</p>
        {order && <Link href="/host/email-activity" className="mt-4 inline-block py-2 text-sm text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">View all emails</Link>}
      </header>
      {!emailTrackingEnabled() && (
        <p className="mt-4 text-sm text-muted">Email tracking setup is pending. Emails still send, but opens and link visits are not recorded yet.</p>
      )}
      <section className="border-t border-rule" aria-label="Sent emails">
        {messages.length ? messages.map(message => <EmailRecord key={message.id} message={message} />) : (
          <p className="py-10 text-sm text-muted">No tracked emails yet. Emails sent after tracking starts will appear here.</p>
        )}
      </section>
    </div>
  );
}
