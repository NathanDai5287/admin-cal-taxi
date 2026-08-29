import type { Metadata } from "next";

import "./reimbursements.css";

const themeScript = `(() => {
  try {
    const saved = localStorage.getItem("reimbursement-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.reimbursementTheme = theme;
  } catch {}
})();`;

export const metadata: Metadata = {
  title: {
    default: "Chapter Reimbursements",
    template: "%s · Chapter Reimbursements",
  },
  description: "Submit and review chapter expense reimbursements.",
};

export default function ReimbursementsLayout({ children }: LayoutProps<"/reimbursements">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <div data-reimbursements>{children}</div>
    </>
  );
}
