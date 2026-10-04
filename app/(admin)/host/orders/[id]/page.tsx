import { ButtonLink } from "@/components/brand/button";
/**
 * /host/orders/[id] — a single archived rental.
 *
 * Server component: one fetch to minmus for the full Order (documents,
 * snapshot, notes included — unlike the list, which only gets OrderSummary).
 * Interactive pieces (status override, delete, notes, workspace actions,
 * document regeneration) are split into client children below.
 *
 * Next 16: `params` is a Promise. `getOrder` returns `null` for an unknown
 * id → notFound(). A thrown OrdersUnavailableError (minmus down mid-request,
 * or the archive never configured) is caught explicitly so this page never
 * 500s the same way the list page doesn't.
 */

import { notFound } from "next/navigation";
import { getOrder, ordersConfigured, OrdersUnavailableError } from "@/lib/host-orders";
import { computeLedger, deriveStatus } from "@/lib/host-orders-types";
import { listSigning, type SigningRevision } from "@/lib/host-signing";
import OrderOverview from "@/components/host/OrderOverview";
import { contractDownload, type StoredContractDownload } from "@/lib/host-contract-download";
import { fmtUSD } from "../order-format";
import { hostingPlanFromOrder } from "@/lib/finance/hosting";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import ContractSnapshot from "./ContractSnapshot";
import DeleteOrderButton from "./DeleteOrderButton";
import OrderDocuments from "./OrderDocuments";
import OrderNotes from "./OrderNotes";
import PricingSnapshot from "./PricingSnapshot";
import StatusControl from "./StatusControl";
import WorkspaceActions from "./WorkspaceActions";
import HostingFinancePanel from "./HostingFinancePanel";
import OrderDetailHeader from "./OrderDetailHeader";

export const dynamic = "force-dynamic";

function BackLink() {
  return <ButtonLink href="/host/orders" variant="text">← Back to Orders</ButtonLink>;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!ordersConfigured()) {
    return (
      <div className="space-y-6">
        <BackLink />
        <section className="card-plain p-6 max-w-2xl">
          <p className="text-[13.5px] font-semibold text-ink">
            The order archive isn&rsquo;t wired up yet.
          </p>
          <p className="text-[13px] text-muted mt-2 leading-relaxed">
            Set <code className="text-ink">HOST_BACKEND_ORIGIN</code> and{" "}
            <code className="text-ink">HOST_BACKEND_KEY</code> in the environment to enable the
            archive.
          </p>
        </section>
      </div>
    );
  }

  const supabase = createAdminClient();
  const signingPromise = listSigning(id)
    .then((revisions): { contract: StoredContractDownload | null; failed: boolean; revisions: SigningRevision[] } => ({
      contract: contractDownload(revisions),
      failed: false,
      revisions,
    }))
    .catch(() => ({ contract: null, failed: true, revisions: [] as SigningRevision[] }));
  const financePromise = supabase.from("hosting_finance_orders").select("status, planned_revenue, planned_fire_permit").eq("order_id", id).maybeSingle();
  const paymentsPromise = supabase.from("hosting_finance_payments").select("id, kind, amount, paid_date, reversed_at").eq("order_id", id).order("paid_date", { ascending: false });

  let order;
  try {
    order = await getOrder(id);
  } catch (err) {
    if (err instanceof OrdersUnavailableError) {
      return (
        <div className="space-y-6">
          <BackLink />
          <section className="card-plain p-6 max-w-2xl" style={{ borderColor: "var(--color-warn)" }}>
            <p className="text-[13.5px] font-semibold text-warn">
              The order archive is unreachable.
            </p>
            <p className="text-[13px] text-muted mt-2 leading-relaxed">{err.message}</p>
          </section>
        </div>
      );
    }
    throw err;
  }

  if (!order) notFound();

  const status = deriveStatus(order);
  const ledger = computeLedger(order.documents);
  const planPreview = hostingPlanFromOrder(order);
  const [signing, financeResult, paymentsResult] = await Promise.all([
    signingPromise,
    financePromise,
    paymentsPromise,
  ]);
  if (financeResult.error || paymentsResult.error) throw new Error("Unable to load hosting finance details.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div key={order.id} className="space-y-10">
      <OrderDetailHeader order={order} status={status} actions={
        <>
          <WorkspaceActions order={order} />
          <StatusControl orderId={order.id} current={order.statusOverride} />
          <DeleteOrderButton orderId={order.id} />
        </>
      } />

      <OrderOverview order={order} revisions={signing.revisions} signingUnavailable={signing.failed} budgetIncluded={financeResult.data?.status === "confirmed"} recordedRentalPayments={(paymentsResult.data ?? []).filter(payment => payment.kind === "revenue" && !payment.reversed_at).reduce((total, payment) => total + Number(payment.amount), 0)} />
      <OrderDocuments key={order.id} order={order} signingContract={signing.contract} signingLookupFailed={signing.failed} signingRevisions={signing.failed ? undefined : signing.revisions} />

      <section className="card">
        <div className="card-header">
          <span className="card-title">Document totals</span>
          <span className="card-subtitle">
            Generated invoices and credit memos only. Recorded payments are shown separately below.
          </span>
        </div>
        <div className="card-body grid gap-6 sm:grid-cols-4">
          <LedgerStat label="Deposit invoiced" value={ledger.depositInvoiced} />
          <LedgerStat label="Rental invoiced" value={ledger.rentalInvoiced} />
          <LedgerStat label="Credit memo issued" value={ledger.refunded} />
          <LedgerStat label="Net invoiced" value={ledger.balance} emphasize />
        </div>
      </section>

      <HostingFinancePanel
        key={JSON.stringify({ finance: financeResult.data, payments: paymentsResult.data })}
        financeOrder={financeResult.data ? {
          status: financeResult.data.status,
          plannedRevenue: Number(financeResult.data.planned_revenue),
          plannedFirePermit: Number(financeResult.data.planned_fire_permit),
        } : null}
        orderId={order.id}
        payments={(paymentsResult.data ?? []).map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          amount: Number(payment.amount),
          paidDate: payment.paid_date,
          reversedAt: payment.reversed_at,
        }))}
        previewFirePermit={planPreview.plannedFirePermit}
        previewRevenue={planPreview.plannedRevenue}
        today={today}
      />

      <PricingSnapshot snapshot={order.snapshot} rentalPrice={order.rentalPrice} depositAmount={order.depositAmount} />
      <ContractSnapshot snapshot={order.snapshot} />

      <OrderNotes orderId={order.id} initialNotes={order.notes} />
    </div>
  );
}

function LedgerStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p
        className={
          "tabular-nums " +
          (emphasize ? "text-[20px] font-bold text-brand" : "text-[16px] font-semibold text-ink")
        }
      >
        {fmtUSD(value)}
      </p>
    </div>
  );
}
