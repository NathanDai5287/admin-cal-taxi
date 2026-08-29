import Link from "next/link";

import { SiteHomeIcon } from "@/components/site-home-icon";

export function ReimbursementBrand({ href }: { href: string }) {
  return (
    <div className="brand">
      <SiteHomeIcon />
      <Link className="brand-text" href={href}>Chapter Reimbursements</Link>
    </div>
  );
}
