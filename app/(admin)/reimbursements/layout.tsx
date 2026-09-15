import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Finance",
    template: "%s · Finance",
  },
  description: "Sign in to chapter finances.",
};

export default function ReimbursementsLayout({ children }: LayoutProps<"/reimbursements">) {
  return (
    <div data-brand className="min-h-screen">
      {children}
    </div>
  );
}
