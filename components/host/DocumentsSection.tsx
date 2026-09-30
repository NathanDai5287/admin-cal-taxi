import type { ReactNode } from "react";

/** The shared document workspace shell for live and archived orders. */
export default function DocumentsSection({
  actions,
  children,
  paymentMessage,
}: {
  actions: ReactNode;
  children: ReactNode;
  paymentMessage: ReactNode;
}) {
  return (
    <section className="card" aria-label="Rental documents">
      <div className="border-b border-rule px-5 py-4 space-y-3">{actions}</div>
      <div className="divide-y divide-rule">{children}</div>
      {paymentMessage}
    </section>
  );
}
