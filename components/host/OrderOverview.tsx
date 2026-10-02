import type { Order } from "@/lib/host-orders-types";
import type { SigningRevision } from "@/lib/host-signing";

export default function OrderOverview({ order, revisions, signingUnavailable = false, budgetIncluded, recordedRentalPayments }: {
  order: Order;
  revisions: SigningRevision[];
  signingUnavailable?: boolean;
  budgetIncluded: boolean;
  recordedRentalPayments: number;
}) {
  const current = revisions.find(row => ["awaiting_signatures", "preparing_completed_copy", "signed", "activating", "creating", "created", "creation_uncertain"].includes(row.state));
  const signed = current?.state === "signed" && current.files.completed && current.files.audit;
  const status = signingUnavailable ? "Status unavailable" : signed ? "Signed" : current?.state === "preparing_completed_copy" || current?.state === "signed" ? "Preparing completed copy" : current?.state === "awaiting_signatures" ? "Awaiting signatures" : current ? "Preparing signing links" : "Not yet sent for signing";
  const money = (amount: number | null) => amount === null ? "Not set" : amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return <section className="card" aria-label="Order overview">
    <div className="card-header"><h2 className="card-title">Order overview</h2></div>
    <div className="card-body space-y-6">
      <dl className="grid gap-5 sm:grid-cols-3 text-[14px]">
        <div><dt className="field-label">Agreed rental fee</dt><dd className="font-semibold">{money(order.rentalPrice)}</dd></div>
        <div><dt className="field-label">Security deposit</dt><dd className="font-semibold">{money(order.depositAmount)}</dd></div>
        <div><dt className="field-label">Organizations</dt><dd>{order.clubName}</dd></div>
      </dl>
      <dl className="grid gap-5 sm:grid-cols-3 text-[13px] border-t border-rule pt-5">
        <div><dt className="field-label">Contract signatures</dt><dd className={signed ? "font-semibold text-ok" : "font-semibold"}>{status}</dd>{current && <dd className="field-hint">{current.signedCount} of {current.totalCount} signed · revision {current.revision}</dd>}</div>
        <div><dt className="field-label">Rental payments recorded</dt><dd>{money(recordedRentalPayments)} of {money(order.rentalPrice)}</dd><dd className="field-hint">Only recorded payments are counted.</dd></div>
        <div><dt className="field-label">Budget</dt><dd>{budgetIncluded ? "Included in budget" : "Not included in budget"}</dd><dd className="field-hint">Independent of signatures and payments.</dd></div>
      </dl>
    </div>
  </section>;
}
