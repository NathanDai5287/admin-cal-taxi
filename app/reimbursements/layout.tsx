import type { Metadata } from "next";

import "./reimbursements.css";

export const metadata: Metadata = {
  title: {
    default: "Chapter Reimbursements",
    template: "%s · Chapter Reimbursements",
  },
  description: "Submit and review chapter expense reimbursements.",
};

export default function ReimbursementsLayout({ children }: LayoutProps<"/reimbursements">) {
  return <div data-reimbursements>{children}</div>;
}
