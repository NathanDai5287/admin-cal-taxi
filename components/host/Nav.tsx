import Link from "next/link";

import { AppNav } from "@/components/brand/app-nav";
import { SiteHomeIcon } from "@/components/site-home-icon";

const tabs = [
  { href: "/host", label: "Create" },
  { href: "/host/orders", label: "Orders" },
  { href: "/host/inquiries", label: "Inquiries" },
  { href: "/host/email-activity", label: "Email activity" },
];

export default function Nav() {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="h-[3px] bg-brand" />
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="flex h-16 items-center gap-4">
          <SiteHomeIcon />
          <span className="h-6 w-px bg-rule" aria-hidden="true" />
          <Link href="/host" className="text-sm font-bold tracking-[0.14em] text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
            Rental Tools
          </Link>
        </div>
        <AppNav
          homeHref="/host"
          title="Host"
          variant="section"
          prefetchTabContent
          tabs={tabs}
        />
      </div>
    </header>
  );
}
