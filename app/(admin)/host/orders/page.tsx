import { ButtonLink } from "@/components/brand/button";
/**
 * /host/orders — the order archive list.
 *
 * Amazon-"past orders"-style: reverse-chronological by event date, grouped
 * by year. This is a server component so the one fetch to minmus happens
 * once per request; search/status filtering happens client-side in
 * OrdersList so it feels instant without a second round trip.
 *
 * Three distinct non-happy paths, each handled explicitly rather than
 * letting the page 500:
 *   - the archive was never wired up (no env vars)      → explain + which vars
 *   - the archive is wired up but minmus is unreachable  → distinct from "empty"
 *   - the archive is reachable and simply has no orders  → point at /host/documents
 */

import { listOrders, ordersConfigured, OrdersUnavailableError } from "@/lib/host-orders";
import OrdersList from "./OrdersList";

export const dynamic = "force-dynamic";

function PageHeading() {
  return (
    <div>
      <span className="page-eyebrow">Order Archive</span>
      <h1 className="page-title">Orders</h1>
      <p className="page-lede">
        Every rental saved to the archive, most recent event first. Open one to see its
        documents, ledger, and the exact pricing and contract terms that were agreed.
      </p>
    </div>
  );
}

export default async function OrdersPage() {
  if (!ordersConfigured()) {
    return (
      <div className="space-y-8">
        <PageHeading />
        <section className="card-plain p-6 max-w-2xl">
          <p className="text-[13.5px] font-semibold text-ink">
            The order archive isn&rsquo;t wired up yet.
          </p>
          <p className="text-[13px] text-muted mt-2 leading-relaxed">
            Saving and browsing past rentals needs the Flask backend on minmus. Set{" "}
            <code className="text-ink">HOST_BACKEND_ORIGIN</code> and{" "}
            <code className="text-ink">HOST_BACKEND_KEY</code> in the environment to enable it.
          </p>
        </section>
      </div>
    );
  }

  let orders;
  try {
    orders = await listOrders();
  } catch (err) {
    if (err instanceof OrdersUnavailableError) {
      return (
        <div className="space-y-8">
          <PageHeading />
          <section className="card-plain p-6 max-w-2xl" style={{ borderColor: "var(--color-warn)" }}>
            <p className="text-[13.5px] font-semibold text-warn">
              The order archive is unreachable.
            </p>
            <p className="text-[13px] text-muted mt-2 leading-relaxed">{err.message}</p>
            <p className="text-[12px] text-muted mt-3">
              This is different from having no orders yet — minmus may be down. Try again shortly.
            </p>
          </section>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="space-y-8">
      <PageHeading />

      {orders.length === 0 ? (
        <section className="card-plain p-10 text-center max-w-xl">
          <p className="text-[14px] font-semibold text-ink">No orders yet.</p>
          <p className="text-[13px] text-muted mt-2 leading-relaxed">
            Orders are saved from the documents step once a contract or invoice is generated.
          </p>
          <ButtonLink href="/host/documents" variant="primary" className="inline-flex mt-5">
            Go to Documents
          </ButtonLink>
        </section>
      ) : (
        <OrdersList orders={orders} />
      )}
    </div>
  );
}
