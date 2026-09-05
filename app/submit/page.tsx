import { SubmitForm } from "@/app/submit/submit-form";
import { SignOutButton } from "@/components/reimbursements/sign-out-button";
import { requireMember } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const { profile } = await requireMember();

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="page-eyebrow">Chapter expenses</p>
          <h1 className="page-title">Submit a reimbursement</h1>
          <p className="page-lede">
            Add the expense details and attach a photo of the receipt. The receipt
            total is checked automatically before a treasurer reviews it.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-muted">
          <span>
            Signed in as <span className="font-semibold text-ink">{profile.full_name}</span>
          </span>
          <SignOutButton action="/auth/signout" />
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <span className="card-title">New reimbursement</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <SubmitForm defaultFullName={profile.full_name} />
        </div>
      </section>
    </>
  );
}
