import { SubmitForm } from "@/app/submit/submit-form";

export default function SubmitPage() {
  return (
    <>
      <div className="mb-6">
        <p className="page-eyebrow">Chapter expenses</p>
        <h1 className="page-title">Submit a reimbursement</h1>
        <p className="page-lede">
          Add the expense details and attach a photo of the receipt. The receipt
          total is checked automatically before a treasurer reviews it.
        </p>
      </div>

      <section className="card">
        <div className="card-header">
          <span className="card-title">New reimbursement</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <SubmitForm />
        </div>
      </section>
    </>
  );
}
