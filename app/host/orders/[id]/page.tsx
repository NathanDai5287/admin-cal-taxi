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

import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, ordersConfigured, OrdersUnavailableError } from "@/lib/host-orders";
import { computeLedger, deriveStatus } from "@/lib/host-orders-types";
import { formatDateISO } from "@/lib/host-format";
import { fmtUSD } from "../order-format";
import StatusPill from "../StatusPill";
import ContractSnapshot from "./ContractSnapshot";
import DeleteOrderButton from "./DeleteOrderButton";
import OrderDocuments from "./OrderDocuments";
import OrderNotes from "./OrderNotes";
import PricingSnapshot from "./PricingSnapshot";
import StatusControl from "./StatusControl";
import WorkspaceActions from "./WorkspaceActions";

export const dynamic = "force-dynamic";

function BackLink() {
  return <Link href="/host/orders" className="btn-link">← Back to Orders</Link>;
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

      <section>
        <h2 className="card-title mb-3">Documents</h2>
        <OrderDocuments order={order} />
      </section>

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
