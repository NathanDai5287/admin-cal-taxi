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
import { formatDateISO } from "@/lib/host-format";
import { fmtUSD } from "../order-format";
import { hostingPlanFromOrder } from "@/lib/finance/hosting";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import StatusPill from "../StatusPill";
import ContractSnapshot from "./ContractSnapshot";
import DeleteOrderButton from "./DeleteOrderButton";
import OrderDocuments from "./OrderDocuments";
import OrderNotes from "./OrderNotes";
import PricingSnapshot from "./PricingSnapshot";
import StatusControl from "./StatusControl";
import WorkspaceActions from "./WorkspaceActions";
import HostingFinancePanel from "./HostingFinancePanel";

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
  const supabase = createAdminClient();
  const [financeResult, paymentsResult] = await Promise.all([
    supabase.from("hosting_finance_orders").select("status, planned_revenue, planned_fire_permit").eq("order_id", order.id).maybeSingle(),
    supabase.from("hosting_finance_payments").select("id, kind, amount, paid_date, reversed_at").eq("order_id", order.id).order("paid_date", { ascending: false }),
  ]);
  if (financeResult.error || paymentsResult.error) throw new Error("Unable to load hosting finance details.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <BackLink />

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <span className="page-eyebrow">Order</span>
            <h1 className="page-title">{order.clubName || "(no organization)"}</h1>
            <p className="text-[13.5px] text-muted mt-2">
              {formatDateISO(order.eventDate) || "No event date"}
            </p>
            {/* Date only, from the UTC timestamp. Rendering the clock time
                would show the server's timezone (UTC on Vercel) as though it
                were the reader's, so an evening save reads as the next day. */}
            <p className="text-[11.5px] text-muted mt-3">
              Created {formatDateISO(order.createdAt.slice(0, 10))} · Updated{" "}
              {formatDateISO(order.updatedAt.slice(0, 10))}
            </p>
          </div>
          <StatusPill status={status} large />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-rule">
          <WorkspaceActions order={order} />
          <StatusControl orderId={order.id} current={order.statusOverride} />
          <DeleteOrderButton orderId={order.id} />
        </div>
      </div>

      <OrderDocuments order={order} />

      <section className="card">
        <div className="card-header">
          <span className="card-title">Ledger</span>
          <span className="card-subtitle">
            What&rsquo;s been invoiced — the app never records payment receipt, so this is not a
            statement of what was actually paid.
          </span>
        </div>
        <div className="card-body grid gap-6 sm:grid-cols-4">
          <LedgerStat label="Deposit invoiced" value={ledger.depositInvoiced} />
          <LedgerStat label="Rental invoiced" value={ledger.rentalInvoiced} />
          <LedgerStat label="Refunded" value={ledger.refunded} />
          <LedgerStat label="Balance" value={ledger.balance} emphasize />
        </div>
      </section>

      <HostingFinancePanel
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

      <PricingSnapshot snapshot={order.snapshot} />
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
