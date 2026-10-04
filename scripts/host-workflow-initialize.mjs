// Additive rollout: register existing notification routes and include already
// sent agreements in the forecast. Never writes to the order/signing backend,
// sends emails, or overwrites an existing finance row.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const origin = process.env.HOST_BACKEND_ORIGIN.replace(/\/$/, "");
async function read(path) { const r = await fetch(`${origin}${path}`, { headers: { "X-Admin-Key": process.env.HOST_BACKEND_KEY } }); if (!r.ok) throw Error(`Archive read failed (${r.status})`); return r.json(); }
const settings = await db.from("hosting_event_settings").select("activated_at").single();
if (settings.error) throw settings.error;
const { orders } = await read("/api/orders");
let registered = 0; let forecasts = 0;
for (const summary of orders) {
  const { revisions } = await read(`/api/orders/${encodeURIComponent(summary.id)}/signing`);
  for (const revision of revisions.filter(r => r.envelope_id)) {
    const result = await db.from("hosting_signing_references").upsert({ revision_id: revision.id, order_id: summary.id, envelope_id: revision.envelope_id }, { onConflict: "revision_id", ignoreDuplicates: true });
    if (result.error) throw result.error; registered++;
  }
  const current = [...revisions].sort((a, b) => b.revision - a.revision).find(r => ["signed", "awaiting_signatures"].includes(r.state));
  if (!current || !current.envelope_id || current.created_at >= settings.data.activated_at || summary.statusOverride === "cancelled") continue;
  const { order } = await read(`/api/orders/${encodeURIComponent(summary.id)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.eventDate) || !(order.rentalPrice > 0)) continue;
  const permit = Number(order.snapshot.pricingBreakdown?.firePermit ?? 0);
  const result = await db.from("hosting_finance_orders").upsert({ order_id: order.id, organization: order.clubName, event_date: order.eventDate, planned_revenue: order.rentalPrice, planned_fire_permit: Number.isFinite(permit) && permit > 0 ? permit : 0 }, { onConflict: "order_id", ignoreDuplicates: true });
  if (result.error) throw result.error; forecasts++;
}
console.log(`Registered ${registered} existing envelope route(s); ensured forecast inclusion for ${forecasts} previously sent agreement(s). No signing or order records changed; no emails sent.`);
