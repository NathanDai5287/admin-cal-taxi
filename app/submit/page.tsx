import { redirect } from "next/navigation";

import { SubmitForm } from "@/app/submit/submit-form";
import { AccessDenied } from "@/components/auth/access-denied";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (!hasAppAccess(session, "submit")) {
    return <AccessDenied />;
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="page-eyebrow">Chapter expenses</p>
          <h1 className="page-title">Submit a reimbursement</h1>
          <p className="page-lede">
            Add the expense details and attach a photo of the receipt. The receipt
            total is checked automatically before an administrator reviews it.
          </p>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <span className="card-title">New reimbursement</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <fieldset disabled={session.appAccess.submit !== "write"}><SubmitForm /></fieldset>
        </div>
      </section>
    </>
  );
}
