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
import { deriveStatus } from "@/lib/host-orders-types";
import { listSigning, type SigningRevision } from "@/lib/host-signing";
import OrderTimeline from "./OrderTimeline";
import OrderSupportingDetails from "./OrderSupportingDetails";
import { loadWorkflow } from "@/lib/host-workflow";
import { hostEmailConfigured } from "@/lib/host-email";
import { contractDownload, type StoredContractDownload } from "@/lib/host-contract-download";
import { hostingPlanFromOrder } from "@/lib/finance/hosting";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import DeleteOrderButton from "./DeleteOrderButton";
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
  const workflow = await loadWorkflow(id);
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
    <div key={order.id} className="space-y-7">
      <OrderDetailHeader order={order} status={status} actions={
        <>
          <WorkspaceActions order={order} />
          {!signing.failed && !signing.revisions.some(r => !!r.envelope_id) && <DeleteOrderButton orderId={order.id} />}
        </>
      } />

      <HostingFinancePanel
        key={JSON.stringify({ finance: financeResult.data, payments: paymentsResult.data })}
        financeOrder={financeResult.data ? {
          status: financeResult.data.status,
          plannedRevenue: Number(financeResult.data.planned_revenue),
          plannedFirePermit: Number(financeResult.data.planned_fire_permit),
        } : null}
        orderId={order.id}
        eventCancelled={!!workflow.cancelledAt || order.statusOverride === "cancelled"}
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

      <OrderTimeline order={order} revisions={signing.revisions} workflow={workflow} today={today} emailConfigured={hostEmailConfigured()} previewReplyTo={process.env.HOST_EMAIL_REPLY_TO} signingUnavailable={signing.failed}
        rentalPaid={(paymentsResult.data ?? []).filter(p => p.kind === "revenue" && !p.reversed_at).reduce((n, p) => n + Number(p.amount), 0)}
        permitPaid={(paymentsResult.data ?? []).filter(p => p.kind === "fire_permit" && !p.reversed_at).reduce((n, p) => n + Number(p.amount), 0)}
        permitTotal={Number(financeResult.data?.planned_fire_permit ?? planPreview.plannedFirePermit)} />
      <OrderSupportingDetails order={order} revisions={signing.revisions} signingContract={signing.contract} signingLookupFailed={signing.failed} />
    </div>
  );
}
