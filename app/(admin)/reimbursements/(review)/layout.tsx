import { redirect } from "next/navigation";

import { AppNav } from "@/components/brand/app-nav";
import { SignOutButton } from "@/components/reimbursements/sign-out-button";
import { getSessionProfile } from "@/lib/reimbursements/auth";

// Every page in this group requires a signed-in administrator. Members who
// sign in here get directed to the submission site instead.
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/reimbursements/login");
  }

  if (session.profile.role !== "admin") {
    return (
      <main className="max-w-[520px] mx-auto px-6 py-16">
        <section className="card">
          <div className="card-header">
            <span className="card-title">Admins only</span>
          </div>
          <div className="card-body border-t border-rule pt-5">
            <p className="text-[13.5px] text-muted mb-5">
              Signed in as <span className="font-semibold text-ink">{session.profile.full_name}</span>.
              This area is restricted to administrators. To submit an expense, use the
              member submission site.
            </p>
            <div className="flex items-center gap-4">
              <a className="btn-primary" href="https://reimbursements.cal.taxi">
                Go to submissions
              </a>
              <SignOutButton action="/reimbursements/auth/signout" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <AppNav
        homeHref="/reimbursements"
        title="Theta Xi"
        subtitle="Reimbursements"
        tabs={[
          { href: "/reimbursements", label: "Review" },
          { href: "/reimbursements/reports", label: "Reports" },
        ]}
        action={<SignOutButton action="/reimbursements/auth/signout" />}
      />
      <main className="max-w-[1080px] mx-auto px-6 py-8">{children}</main>
    </>
  );
}
