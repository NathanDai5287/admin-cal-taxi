import type { Metadata } from "next";

import { AppNav } from "@/components/brand/app-nav";

export const metadata: Metadata = {
  title: "Submit a reimbursement",
  description: "Submit a chapter expense for reimbursement.",
};

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-brand className="min-h-screen">
      <AppNav homeHref="/" title="Theta Xi" subtitle="Reimbursements" />
      <main className="max-w-[720px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
