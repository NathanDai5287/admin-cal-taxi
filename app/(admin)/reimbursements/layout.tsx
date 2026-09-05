import type { Metadata } from "next";

import { AppNav } from "@/components/brand/app-nav";

export const metadata: Metadata = {
  title: {
    default: "Reimbursements",
    template: "%s · Reimbursements",
  },
  description: "Review chapter expense reimbursements.",
};

export default function ReimbursementsLayout({ children }: LayoutProps<"/reimbursements">) {
  return (
    <div data-brand className="min-h-screen">
      <AppNav
        homeHref="/reimbursements"
        title="Theta Xi"
        subtitle="Reimbursements"
        tabs={[
          { href: "/reimbursements", label: "Review" },
          { href: "/reimbursements/reports", label: "Reports" },
        ]}
      />
      <main className="max-w-[1080px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
