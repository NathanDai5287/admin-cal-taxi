import type { Metadata } from "next";

import { requireAppAccess } from "@/lib/reimbursements/auth";
import { loadDamageHistoryOverview } from "@/lib/host-settlement";
import { formatDateISO } from "@/lib/host-format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Damage history" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default async function DamageHistoryPage() {
  await requireAppAccess("host");
  const clubs = await loadDamageHistoryOverview();
  return <div className="space-y-8">
    <div><span className="page-eyebrow">Hosting records</span><h1 className="page-title">Damage history</h1><p className="page-lede">Factual settlement history by responsible club, linked to the original event records and evidence.</p></div>
    {!clubs.length ? <section className="card-plain max-w-xl p-8"><p className="text-sm font-semibold">No damage settlements recorded.</p><p className="mt-2 text-[13px] text-muted">Itemized settlements will appear here after they are saved on an order.</p></section>
      : <div className="space-y-4">{clubs.map(club => <section key={club.key} className="card-plain p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{club.name}</h2><p className="mt-1 text-[12px] text-muted">{club.incidentCount} event{club.incidentCount === 1 ? "" : "s"} with recorded damage</p></div><div className="text-right"><p className="text-[11px] uppercase tracking-wide text-muted">Associated deductions</p><p className="mt-1 font-semibold tabular-nums">{money(club.associatedTotal)}</p></div></div>
        <ul className="mt-4 divide-y divide-rule">{club.events.map(event => <li key={event.orderId} className="grid gap-2 py-3 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)_6rem] sm:items-start"><a href={`/host/orders/${event.orderId}`} className="font-medium text-brand hover:text-ink">{event.eventDate ? formatDateISO(event.eventDate) : "View order"}</a><div><p>{event.descriptions.join(" · ")}</p><p className="mt-1 text-[11px] text-muted">{event.clubs.join(" · ")} · {event.status}</p></div><span className="text-right tabular-nums text-muted">{money(event.total)}</span></li>)}</ul>
      </section>)}</div>}
  </div>;
}
