import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, ButtonLink } from "../../components/brand/button";
import Nav from "../../components/host/Nav";
import { HostWorkspaceBoundary } from "../../lib/host-shared-state";
import { beginDraft, notifyDraftSelected } from "../../lib/host-draft-storage";
import EventPage from "../../app/(admin)/host/page";
import PricingPage from "../../app/(admin)/host/pricing/page";
import ContractPage from "../../app/(admin)/host/contract/page";
import DocumentsPage from "../../app/(admin)/host/documents/page";
import OrdersList from "../../app/(admin)/host/orders/OrdersList";
import OrderDetailHeader from "../../app/(admin)/host/orders/[id]/OrderDetailHeader";
import WorkspaceActions from "../../app/(admin)/host/orders/[id]/WorkspaceActions";
import HostingFinancePanel from "../../app/(admin)/host/orders/[id]/HostingFinancePanel";
import OrderSupportingDetails from "../../app/(admin)/host/orders/[id]/OrderSupportingDetails";
import OrderTimeline from "../../app/(admin)/host/orders/[id]/OrderTimeline";
import { previewHostingEmailAction, previewWorkflow } from "./email-actions";
import { eventProgress } from "../../lib/host-event";
import { contractDownload } from "../../lib/host-contract-download";
import { deriveStatus } from "../../lib/host-orders-types";
import { read, write, reset, exampleDraft, EXAMPLE_ORDER_ID } from "./data";
import { navigate, usePathname } from "./navigation";

// All browser fetches stay on this loopback server. Actions are compile-time
// replacements; neither credentials nor production transports enter the bundle.
const localFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  if (url.origin !== location.origin) throw new Error("Remote requests are disabled in the local preview.");
  if (url.pathname.endsWith("/email-previews")) { const delay = Number(localStorage.getItem("host.preview.delay") || 0); if (delay) await new Promise(resolve => setTimeout(resolve, delay)); return Response.json(await previewHostingEmailAction(JSON.parse(String(init?.body)))); }
  if (url.pathname.startsWith("/api/host")) {
    const sample = await localFetch("/sample.pdf");
    return new Response(await sample.arrayBuffer(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="local-preview.pdf"', "X-Generation-Receipt": "local-sample" } });
  }
  return localFetch(input, init);
};

function App() {
  const pathname = usePathname();
  const [, redraw] = useState(0);
  useEffect(() => { const update = () => redraw(count => count + 1); window.addEventListener("preview-data", update); return () => window.removeEventListener("preview-data", update); }, []);
  const data = read();
  const id = pathname.startsWith("/host/orders/") ? pathname.split("/")[3] : "";
  const order = data.orders.find(row => row.id === id);
  const revisions = data.revisions[id] ?? [];
  const finance = data.finance[id] ?? { included: false, payments: [] };

  function simulate() {
    const next = read(); const revision = next.revisions[id]?.find(row => row.state === "awaiting_signatures"); if (!revision) return;
    const person = revision.recipients.find(person => person.status !== "SIGNED"); if (person) person.status = "SIGNED";
    revision.signedCount = revision.recipients.filter(person => person.status === "SIGNED").length;
    if (revision.signedCount === revision.totalCount) { revision.state = "signed"; revision.files.completed = true; revision.files.audit = true; }
    write(next); window.dispatchEvent(new Event("focus"));
  }
  return <div data-brand>
    <aside className="border-b border-rule bg-brand-light px-6 py-3 text-[13px] space-y-2">
      <p className="font-semibold">Local preview: sample data only. Signing, payments, and PDFs are simulated. Your live signing requests are untouched.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button compact variant="text" onClick={() => { const draft = beginDraft(exampleDraft()); notifyDraftSelected(draft); navigate("/host"); }}>Load example draft</Button>
        <ButtonLink compact variant="text" href={`/host/orders/${EXAMPLE_ORDER_ID}`}>Five-person sample order</ButtonLink>
        {order && <Button compact variant="text" onClick={simulate}>Simulate one signature</Button>}
        <Button compact variant="text" onClick={() => { reset(); navigate(`/host/orders/${EXAMPLE_ORDER_ID}`); }}>Reset sample orders</Button>
      </div>
    </aside>
    <Nav />
    <HostWorkspaceBoundary><main className="max-w-[1080px] mx-auto px-6 py-8">
      {pathname === "/host" && <EventPage />}
      {pathname === "/host/pricing" && <PricingPage />}
      {pathname === "/host/contract" && <ContractPage />}
      {pathname === "/host/documents" && <DocumentsPage />}
      {pathname === "/host/orders" && <div className="space-y-8"><h1 className="page-title">Orders</h1><OrdersList orders={data.orders.map(order => ({ ...order, eventProgress: eventProgress(order.eventDate, data.revisions[order.id] ?? [], previewWorkflow(order.id), "2026-10-04"), documentCount: order.documents.length, documentKinds: order.documents.map(doc => doc.kind) }))} /></div>}
      {order && <div className="space-y-7">
        <OrderDetailHeader order={order} status={deriveStatus(order)} actions={<WorkspaceActions order={order} />} />
        <HostingFinancePanel key={JSON.stringify(finance)} orderId={order.id} financeOrder={finance.included ? { status: "confirmed", plannedRevenue: order.rentalPrice ?? 0, plannedFirePermit: 125 } : null} payments={finance.payments} depositTotal={order.depositAmount ?? 0} previewRevenue={order.rentalPrice ?? 0} previewFirePermit={125} today="2026-10-02" />
        <OrderTimeline order={order} revisions={revisions} workflow={previewWorkflow(id)} today="2026-10-04" emailConfigured depositPaid={finance.payments.filter(p => p.kind === "deposit" && !p.reversedAt).reduce((n,p)=>n+p.amount,0)} rentalPaid={finance.payments.filter(p => p.kind === "revenue" && !p.reversedAt).reduce((n,p)=>n+p.amount,0)} permitPaid={finance.payments.filter(p=>p.kind==="fire_permit" && !p.reversedAt).reduce((n,p)=>n+p.amount,0)} permitTotal={125} />
        <OrderSupportingDetails order={order} revisions={revisions} signingContract={contractDownload(revisions)} />
      </div>}
      {pathname.startsWith("/preview-sign/") && <p>This is a local demonstration link. Use “Simulate one signature” on the sample order to preview progress.</p>}
      {pathname === "/host/inquiries" && <p>Inquiry management is outside this local contract preview.</p>}
    </main></HostWorkspaceBoundary>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
