import type { ReactNode } from "react";

/** The shared document workspace shell for live and archived orders. */
export default function DocumentsSection({
  actions,
  children,
  paymentMessage,
  contract,
}: {
  actions: ReactNode;
  children: ReactNode;
  paymentMessage: ReactNode;
  contract?: ReactNode;
}) {
  return (
    <section className="card" aria-label="Contract and rental documents">
      <div className="border-b border-rule px-5 py-4 space-y-3">{actions}</div>
      {contract && <div className="border-b border-rule">{contract}</div>}
      <div className="px-5 py-4 border-b border-rule">
        <h2 className="card-title">Billing documents</h2>
        <p className="card-subtitle mt-1">All PDFs are available here. Generating a document does not record payment or a refund.</p>
      </div>
      <div className="divide-y divide-rule">{children}</div>
      {paymentMessage}
    </section>
  );
}
