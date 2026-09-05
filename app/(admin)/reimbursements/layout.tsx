import type { Metadata } from "next";

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
      {children}
    </div>
  );
}
