import type { Metadata } from "next";
import { AcceptInvite } from "@/components/reimbursements/accept-invite";
import { ReimbursementBrand } from "@/components/reimbursements/reimbursement-brand";
import { ThemeToggle } from "@/components/reimbursements/theme-toggle";

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
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-card">
        <ReimbursementBrand href="/reimbursements" />
        <h1>Accept your invitation</h1>
        <AcceptInvite tokenHash={verifiedTokenHash} />
      </section>
    </main>
  );
}
