import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { requireAppAccess, getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

import { EmailRecord } from "@/components/email/email-record";
import { emailTrackingEnabled, loadEmailActivity } from "@/lib/email-tracking";

export const metadata: Metadata = { title: "Email activity" };
export const dynamic = "force-dynamic";

export default async function EmailActivityPage({ searchParams }: {
  searchParams: Promise<{ order?: string }>;
}) {
  await requireAppAccess("host");
  const session = await getSessionProfile();
  if (!session) redirect("/");
  if (!hasAppAccess(session, "host")) {
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
