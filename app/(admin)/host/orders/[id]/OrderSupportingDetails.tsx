import type { Order } from "@/lib/host-orders-types";
import type { SigningRevision } from "@/lib/host-signing";
import type { StoredContractDownload } from "@/lib/host-contract-download";
import OrderDocuments from "./OrderDocuments";
import PricingSnapshot from "./PricingSnapshot";
import ContractSnapshot from "./ContractSnapshot";
import OrderNotes from "./OrderNotes";

export default function OrderSupportingDetails({ order, revisions, signingContract, signingLookupFailed = false }: {
  order: Order; revisions: SigningRevision[]; signingContract: StoredContractDownload | null; signingLookupFailed?: boolean;
}) {
  return <div className="grid items-start gap-x-10 gap-y-8 pt-4 lg:grid-cols-2">
    <div className="min-w-0 space-y-7">
      <OrderDocuments key={order.id} order={order} signingContract={signingContract} signingLookupFailed={signingLookupFailed} signingRevisions={signingLookupFailed ? undefined : revisions} showSigning={false} compact />
      {revisions.length > 0 && <section aria-label="Contract versions">
        <h2 className="text-sm font-semibold">Contract versions</h2>
        <ul className="mt-2 space-y-2">{revisions.map(revision => <li key={revision.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
          <span className="text-muted">Revision {revision.revision} · {revision.state.replaceAll("_", " ")}</span>
          {revision.files.original && <a className="text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/original`}>Original</a>}
          {revision.files.completed && <a className="text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/completed`}>Signed PDF</a>}
          {revision.files.audit && <a className="text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/audit`}>Audit</a>}
        </li>)}</ul>
      </section>}
      <OrderNotes orderId={order.id} initialNotes={order.notes} />
    </div>
    <div className="min-w-0 space-y-7">
      <PricingSnapshot snapshot={order.snapshot} rentalPrice={order.rentalPrice} depositAmount={order.depositAmount} />
      <ContractSnapshot snapshot={order.snapshot} />
    </div>
  </div>;
}
