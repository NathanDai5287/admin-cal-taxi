import Link from "next/link";

import { AccessDenied } from "@/components/auth/access-denied";
import type { AppKey } from "@/lib/app-access";
import { SiteHomeIcon } from "@/components/site-home-icon";
import { policyEnabled } from "@/lib/policy/server";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

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
    href: "/nu-news",
    label: "Nu News",
    description: "Semester newsletter: writing, photos, previews, and the final PDF",
  },
  {
    href: "/mailing-list",
    label: "Mailing List",
    description: "Contact records, quick entry, and CSV or spreadsheet imports",
  },
  { href: "/users", label: "Members", description: "Invite people, assign roles, and set what each role can access" },
  { href: "/submit", label: "Reimbursements", description: "Submit chapter expenses and review your requests" },
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

  const accessibleApps = ADMIN_APPS
    .filter((app) => hasAppAccess(session, app.href.slice(1) as AppKey));

  if (!accessibleApps.length) {
    return (
      <div data-brand className="min-h-screen">
        {hasAppAccess(session, "submit")
          ? <AccessDenied title="Reimbursements" message="You can submit reimbursements on the member site." showSubmitLink />
          : <AccessDenied />}
      </div>
    );
  }


  return (
    <div data-brand className="min-h-screen">
      <main className="mx-auto max-w-[1080px] px-6 py-16">
        <SiteHomeIcon />
        <p className="page-eyebrow mt-6">Theta Xi</p>
        <h1 className="page-title">Apps</h1>
        <p className="page-lede">Internal tools for chapter operations.</p>

        <ul className="mt-10 m-0 p-0 grid gap-4 sm:grid-cols-2 list-none">
          {accessibleApps.map((app) => (
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
