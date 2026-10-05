import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { emailTrackingEnabled, loadEmailActivity, type EmailActivity } from "@/lib/email-tracking";
import { getSessionProfile } from "@/lib/reimbursements/auth";

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
    <article className="border-t border-rule py-5">
      <h2 className="text-base font-semibold text-ink">{message.subject}</h2>
      <p className="mt-1 break-all text-sm text-muted">{message.recipient}</p>
      <p className="mt-2 text-sm text-muted">
        Sent <time dateTime={message.sent_at ?? message.created_at}>{activityTime(message.sent_at ?? message.created_at)}</time> · {opens} open observations · {clicks} link visits
      </p>
      {message.kind === "hosting" && message.related_id && (
        <Link href={`/host/orders/${message.related_id}`} className="mt-2 inline-block text-sm underline underline-offset-4">View order</Link>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">View activity ({message.events.length})</summary>
        {message.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {message.events.map((event, index) => (
              <li key={`${event.occurred_at}-${index}`} className="text-sm">
                <span>{event.kind === "opened" ? "Open observed" : "Link visited"}</span>
                <time className="ml-2 text-muted" dateTime={event.occurred_at}>{activityTime(event.occurred_at)}</time>
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
    return <div data-brand><AccessDenied showSubmitLink={session.profile.role === "member"} /></div>;
  }
  const { order } = await searchParams;
  const messages = await loadEmailActivity(order);

  return (
    <div data-brand className="min-h-screen">
      <AppNav homeHref="/" title="Theta Xi" subtitle="Admin" tabs={[
        { href: "/users", label: "Members" },
        { href: "/email-activity", label: "Email activity" },
      ]} />
      <main className="mx-auto max-w-[1080px] px-6 py-8">
        <h1 className="page-title">Email activity</h1>
        <p className="page-lede">See recorded opens and link visits for the latest 100 sent emails.</p>
        <p className="mt-4 max-w-[70ch] text-sm text-muted">
          Email apps can load images automatically or block them. Security checks can visit links automatically. Activity does not prove someone read an email.
        </p>
        <p className="mt-2 text-sm text-muted">Times use Pacific time. Group emails cannot identify which recipient acted.</p>
        {order && <Link href="/email-activity" className="mt-4 inline-block text-sm underline underline-offset-4">View all emails</Link>}
        {!emailTrackingEnabled() && (
          <p className="mt-4 text-sm text-muted">Email tracking setup is pending. Emails still send, but opens and link visits are not recorded yet.</p>
        )}
        <section className="mt-6" aria-label="Sent emails">
          {messages.length ? messages.map(message => <EmailRecord key={message.id} message={message} />) : (
            <p className="border-t border-rule py-8 text-muted">No tracked emails yet. Emails sent after tracking starts will appear here.</p>
          )}
        </section>
      </main>
    </div>
  );
}
