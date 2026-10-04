import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "./reimbursements/supabase/admin";
import { hostingPlanFromOrder } from "./finance/hosting";
import type { Order } from "./host-orders-types";
import type { SigningRevision } from "./host-signing";
import type { EventWorkflow, EmailDelivery } from "./host-event";

// Separate additive schema: the generated reimbursement schema stays intact.
export function workflowDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Hosting workflow database is unavailable.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function loadWorkflow(orderId: string): Promise<EventWorkflow> {
  const db = workflowDb();
  const [settings, state, deliveries] = await Promise.all([
    db.from("hosting_event_settings").select("activated_at").single(),
    db.from("hosting_event_state").select("cancelled_at,refund_amount,refund_date,refund_method").eq("order_id", orderId).maybeSingle(),
    db.from("hosting_email_deliveries").select("id,revision_id,kind,recipient,status,sent_at,created_at,error").eq("order_id", orderId).order("created_at", { ascending: false }),
  ]);
  if (settings.error || state.error || deliveries.error) throw new Error("Unable to load hosting email history. Reload before sending.");
  return {
    activatedAt: settings.data!.activated_at as string, cancelledAt: state.data?.cancelled_at ?? null,
    deliveries: (deliveries.data ?? []) as EmailDelivery[],
    refund: state.data?.refund_amount ? { amount: Number(state.data.refund_amount), date: state.data.refund_date, method: state.data.refund_method } : null,
  };
}
export async function registerSigning(revision: SigningRevision) {
  if (!revision.envelope_id) return;
  const { error } = await workflowDb().from("hosting_signing_references").upsert({ revision_id: revision.id, order_id: revision.order_id, envelope_id: revision.envelope_id }, { onConflict: "revision_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not register signing notification routing.");
}
export async function ensureHostingForecast(order: Order) {
  const db = createAdminClient();
  const existing = await db.from("hosting_finance_orders").select("status").eq("order_id", order.id).maybeSingle();
  if (existing.error) throw new Error("Unable to verify hosting forecast.");
  // Existing confirmed values and cancelled financial history are never rewritten.
  if (existing.data) return;
  const plan = hostingPlanFromOrder(order);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.eventDate) || plan.plannedRevenue <= 0) throw new Error("An event date and positive rental fee are required.");
  const { error } = await workflowDb().rpc("ensure_hosting_forecast", { p_order_id: plan.orderId, p_organization: plan.organization, p_event_date: plan.eventDate, p_revenue: plan.plannedRevenue, p_fire_permit: plan.plannedFirePermit });
  if (error) throw new Error("Unable to add this sent event to the forecast. Reload and retry.");
}
