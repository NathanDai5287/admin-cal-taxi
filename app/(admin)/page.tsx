import Link from "next/link";

import { AccessDenied, SubmitSiteLink } from "@/components/auth/access-denied";
import { SiteHomeIcon } from "@/components/site-home-icon";
import { policyEnabled } from "@/lib/policy/server";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";

const ADMIN_APPS = [
  ...(policyEnabled() ? [{ href: "/policy", label: "Policy assistant", description: "Published policy guidance, source review, and question audit" }] : []),
  {
    href: "/host",
    label: "Host",
    description: "Venue inquiries, rental contracts, pricing, and invoices",
  },
  {
    href: "/rush",
    label: "Rush",
    description: "RSVP leads, QR scans, and pizza votes",
  },
  {
    href: "/finance",
    label: "Finance",
    description: "Accounts, planning, reimbursement review, and reports",
  },
  ...(accreditationEnabled() ? [{
    href: "/accreditation",
    label: "Accreditation",
    description: "Evidence, official templates, grounded drafts, and approved archives",
  }] : []),
  ...(accreditationEnabled() ? [{
    href: "/ask-policy",
    label: "Ask Policy",
    description: "Accreditation questions, source citations, and paths to evidence and document creation",
  }] : []),
  {
    href: "/users",
    label: "Members & invites",
    description: "Invite members and manage who has access",
  },
  {
    href: "/connections",
    label: "Connected AI clients",
    description: "Review and remove AI tools that can manage app data",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, session] = await Promise.all([searchParams, getSessionProfile()]);

  if (!session) {
    return (
      <div data-brand className="min-h-screen">
        <main className="mx-auto max-w-[560px] px-6 py-20">
          <SiteHomeIcon />
          <p className="page-eyebrow mt-6">Theta Xi</p>
          <h1 className="page-title">cal.taxi admin</h1>
          <p className="page-lede">
            Sign in with the button in the top-right corner to continue.
          </p>
          {error === "auth" ? (
            <p className="mt-4 text-[13px] text-warn">
              Sign-in failed. Please try again.
            </p>
          ) : null}
        </main>
      </div>
    );
  }

  if (session.profile.role === "none") {
    return (
      <div data-brand className="min-h-screen">
        <AccessDenied />
      </div>
    );
  }

  if (session.profile.role === "member") {
    return (
      <div data-brand className="min-h-screen">
        <main className="mx-auto max-w-[520px] px-6 py-16">
          <section className="card">
            <div className="card-header">
              <span className="card-title">Member</span>
            </div>
            <div className="card-body border-t border-rule pt-5">
              <h1 className="m-0 text-[18px] font-bold text-ink">
                Chapter reimbursements
              </h1>
              <p className="mt-2 mb-5 text-[13.5px] text-muted leading-relaxed">
                You can submit chapter expenses from the reimbursement form.
              </p>
              <SubmitSiteLink />
              {policyEnabled() && process.env.POLICY_ASSISTANT_MEMBERS_ENABLED === "true" ? <Link className="block mt-4 text-brand underline" href="/policy">Ask the Policy Assistant</Link> : null}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div data-brand className="min-h-screen">
      <main className="mx-auto max-w-[1080px] px-6 py-16">
        <SiteHomeIcon />
        <p className="page-eyebrow mt-6">Theta Xi</p>
        <h1 className="page-title">Admin</h1>
        <p className="page-lede">Internal tools for chapter operations.</p>

        <ul className="mt-10 m-0 p-0 grid gap-4 sm:grid-cols-2 list-none">
          {ADMIN_APPS.map((app) => (
            <li key={app.href}>
              <Link
                href={app.href}
                className="card block no-underline h-full transition-colors hover:bg-brand-light"
              >
                <div className="card-header">
                  <span className="card-title">{app.label}</span>
                </div>
                <div className="card-body border-t border-rule pt-4 pb-5">
                  <p className="m-0 text-[13.5px] text-muted leading-relaxed">
                    {app.description}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
