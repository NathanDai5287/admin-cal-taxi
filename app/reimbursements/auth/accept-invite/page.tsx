import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInvite } from "@/components/reimbursements/accept-invite";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const verifiedTokenHash = type === "invite" ? tokenHash : undefined;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand" href="/reimbursements">
          <span className="brand-mark">R</span>
          <span>Chapter Reimbursements</span>
        </Link>
        <h1>Accept your invitation</h1>
        <AcceptInvite tokenHash={verifiedTokenHash} />
      </section>
    </main>
  );
}
