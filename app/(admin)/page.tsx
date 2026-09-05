import Link from "next/link";

import { SiteHomeIcon } from "@/components/site-home-icon";

const APPS = [
  { href: "/rush", label: "Rush Week", description: "RSVP leads and pizza vote standings" },
  { href: "/host", label: "Host", description: "Rental contracts, pricing, and invoices" },
  {
    href: "/reimbursements",
    label: "Reimbursements",
    description: "Review chapter expense reimbursements",
  },
  {
    href: "https://reimbursements.cal.taxi",
    label: "Submit a reimbursement",
    description: "Public submission page for chapter expenses",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-3">
        <SiteHomeIcon />
        <h1 className="text-2xl font-bold text-slate-900">cal.taxi admin</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">Internal tools</p>

      <ul className="mt-8 flex flex-col gap-2">
        {APPS.map((app) => (
          <li key={app.href}>
            <Link
              href={app.href}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{app.label}</span>
              <span className="block text-sm text-slate-500">{app.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
