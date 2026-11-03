import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { recordHostingDepositReturn } from "@/lib/host-deposit-return";
import { deliverHostingEmails } from "@/lib/host-email";
import { eventToday } from "@/lib/host-event";
import { getOrderFresh, listOrders } from "@/lib/host-orders";
import { orderPaymentSchedule } from "@/lib/host-payment-schedule";
import { loadClubDamageHistory, loadDamageHistoryOverview, loadDepositSettlement } from "@/lib/host-settlement";
import { prepareHostingSettlementEmail } from "@/lib/host-settlement-email";
import {
  hostingEvidenceFileSchema,
  hostingSettlementInputSchema,
  prepareHostingEvidenceUploads,
  recordHostingEvidence,
  removeHostingEvidence,
  saveHostingSettlement,
} from "@/lib/host-settlement-service";
import { sharedStateFromSnapshot } from "@/lib/host-state-model";
import { loadWorkflow, workflowDb } from "@/lib/host-workflow";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import type { Database } from "@/lib/reimbursements/supabase/database.types";

type McpSupabase = import("@supabase/supabase-js").SupabaseClient<Database>;
type McpCaller = { userId: string; clientId: string };
const orderId = z.string().min(1).max(200);
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { ...read, readOnlyHint: false, idempotentHint: false };
const confirmed = { ...write, destructiveHint: true, idempotentHint: true };
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });

async function authorize(supabase: McpSupabase, caller: McpCaller, tool: string, level: "read" | "write", targetId?: string) {
  const permission = await supabase.rpc("has_mcp_app_access", { app_key: "host", required_access: level });
  if (permission.error || !permission.data) throw new Error(`Host ${level} access is required.`);
  const audit = await createAdminClient().from("mcp_audit_log").insert({ user_id: caller.userId, client_id: caller.clientId, tool_name: tool, target_id: targetId });
  if (audit.error) throw new Error("The hosting MCP call could not be recorded.");
}

async function hostingOrder(orderIdValue: string) {
  const order = await getOrderFresh(orderIdValue);
  if (!order) throw new Error("Hosting order not found.");
  const state = sharedStateFromSnapshot(order.snapshot);
  const clubs = state.clubs.length ? state.clubs : [order.clubName];
  const [settlement, history, workflow, deposits, rentals] = await Promise.all([
    loadDepositSettlement(order.id),
    loadClubDamageHistory(clubs, order.id),
    loadWorkflow(order.id),
    workflowDb().from("hosting_deposit_payments").select("amount").eq("order_id", order.id).is("reversed_at", null),
    createAdminClient().from("hosting_finance_payments").select("amount").eq("order_id", order.id).eq("kind", "revenue").is("reversed_at", null),
  ]);
  if (deposits.error || rentals.error) throw new Error("Hosting payments could not be loaded.");
  const depositPaid = (deposits.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const rentalPaid = (rentals.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const today = eventToday();
  const canSettle = !workflow.cancelledAt && order.statusOverride !== "cancelled"
    && today >= orderPaymentSchedule(order).eventEndDate
    && depositPaid >= (order.depositAmount ?? Infinity)
    && rentalPaid >= (order.rentalPrice ?? Infinity);
  return { order, clubs, payments: { depositPaid, rentalPaid }, workflow, settlement, priorDamageHistory: history, canSettle };
}

export function registerHostingTools(server: McpServer, supabase: McpSupabase, caller: McpCaller) {
  server.registerTool("list_hosting_orders", {
    description: "List hosting orders so an agent can find the exact event before reading or changing its security-deposit settlement.",
    inputSchema: z.object({}), annotations: read,
  }, async () => {
    await authorize(supabase, caller, "list_hosting_orders", "read");
    return result(await listOrders());
  });

  server.registerTool("get_hosting_order", {
    description: "Read one hosting order, payments, workflow, current itemized settlement with signed evidence links, and the clubs' prior damage history. Call this before any settlement write.",
    inputSchema: z.object({ orderId: orderId }), annotations: read,
  }, async ({ orderId: id }) => {
    await authorize(supabase, caller, "get_hosting_order", "read", id);
    return result(await hostingOrder(id));
  });

  server.registerTool("list_hosting_damage_history", {
    description: "List the factual security-deposit damage history grouped by responsible club, including linked event IDs and associated deductions.",
    inputSchema: z.object({}), annotations: read,
  }, async () => {
    await authorize(supabase, caller, "list_hosting_damage_history", "read");
    return result(await loadDamageHistoryOverview());
  });

  server.registerTool("save_hosting_deposit_settlement", {
    description: "Create or replace an editable itemized security-deposit settlement. Use stable UUIDs for item IDs and preserve them across edits so attached evidence stays associated. This saves a private draft and does not generate or send email. Deductions may not exceed the deposit.",
    inputSchema: hostingSettlementInputSchema, annotations: write,
  }, async (input) => {
    await authorize(supabase, caller, "save_hosting_deposit_settlement", "write", input.orderId);
    return result(await saveHostingSettlement(input, caller.userId));
  });

  server.registerTool("prepare_hosting_damage_evidence_uploads", {
    description: "Create short-lived signed upload URLs for settlement photographs. First save the draft. Convert each source photo, including HEIC, to an upright JPEG no larger than 10 MB; then PUT it to signedUrl with content-type image/jpeg. After every upload succeeds, call attach_hosting_damage_evidence with its path.",
    inputSchema: z.object({ orderId, count: z.number().int().min(1).max(10) }), annotations: write,
  }, async ({ orderId: id, count }) => {
    await authorize(supabase, caller, "prepare_hosting_damage_evidence_uploads", "write", id);
    const uploads = await prepareHostingEvidenceUploads(id, count);
    return result({ uploads: uploads.map(upload => ({ path: upload.path, signedUrl: upload.signedUrl, method: "PUT", headers: { "content-type": "image/jpeg" } })) });
  });

  server.registerTool("attach_hosting_damage_evidence", {
    description: "Verify photographs already uploaded with prepare_hosting_damage_evidence_uploads and attach each one to a deduction. This does not send email.",
    inputSchema: z.object({ orderId, files: z.array(hostingEvidenceFileSchema).min(1).max(10) }), annotations: write,
  }, async ({ orderId: id, files }) => {
    await authorize(supabase, caller, "attach_hosting_damage_evidence", "write", id);
    return result({ evidence: await recordHostingEvidence(id, files, caller.userId) });
  });

  server.registerTool("remove_hosting_damage_evidence", {
    description: "Permanently remove one photograph from an editable settlement. Read get_hosting_order, identify the exact evidence ID, and ask for confirmation first.",
    inputSchema: z.object({ orderId, evidenceId: z.uuid(), confirm: z.literal(true) }), annotations: confirmed,
  }, async ({ orderId: id, evidenceId }) => {
    await authorize(supabase, caller, "remove_hosting_damage_evidence", "write", id);
    await removeHostingEvidence(id, evidenceId);
    return result({ orderId: id, evidenceId, status: "removed" });
  });

  server.registerTool("prepare_hosting_settlement_email", {
    description: "Generate and freeze the exact security-deposit email, credit memo, and evidence attachments without sending. Return the complete text and HTML for review. Show the user the recipients, subject, exact text, deductions, return amount, and attachments before calling send_hosting_settlement_email.",
    inputSchema: z.object({ orderId, settlementRevision: z.number().int().positive(), message: z.object({ subject: z.string().trim().min(1).max(300), text: z.string().trim().min(1).max(20000) }).optional() }), annotations: write,
  }, async ({ orderId: id, settlementRevision, message }) => {
    await authorize(supabase, caller, "prepare_hosting_settlement_email", "write", id);
    const previews = await prepareHostingSettlementEmail({ orderId: id, settlementRevision, message });
    const preview = previews[0];
    const saved = await workflowDb().from("hosting_email_deliveries").select("payload").eq("id", preview.id).single();
    if (saved.error) throw new Error("The frozen settlement email could not be loaded.");
    return result({ ...preview, text: saved.data.payload.body.text, html: saved.data.payload.body.html, attachments: preview.attachments });
  });

  server.registerTool("get_hosting_settlement_attachment", {
    description: "Open one attachment from a prepared settlement email for review. Returns photographs as MCP image content and the credit memo as an embedded PDF resource. Use the zero-based index from prepare_hosting_settlement_email.",
    inputSchema: z.object({ orderId, deliveryId: z.uuid(), index: z.number().int().min(0).max(25) }), annotations: read,
  }, async ({ orderId: id, deliveryId, index }) => {
    await authorize(supabase, caller, "get_hosting_settlement_attachment", "read", id);
    const saved = await workflowDb().from("hosting_email_deliveries").select("order_id,kind,payload").eq("id", deliveryId).eq("order_id", id).eq("kind", "settlement").maybeSingle();
    const attachment = saved.data?.payload?.body?.attachments?.[index] as { filename?: string; content?: string; contentType?: string } | undefined;
    if (saved.error || !attachment?.filename || !attachment.content) throw new Error("Settlement attachment not found.");
    if (attachment.contentType === "image/jpeg") {
      return { content: [{ type: "image" as const, data: attachment.content, mimeType: "image/jpeg" }] };
    }
    return { content: [{ type: "resource" as const, resource: {
      uri: `hosting-email://${deliveryId}/attachments/${index}/${encodeURIComponent(attachment.filename)}`,
      name: attachment.filename,
      mimeType: "application/pdf",
      blob: attachment.content,
    } }] };
  });

  server.registerTool("send_hosting_settlement_email", {
    description: "Send one previously prepared itemized settlement email through Resend. Only set confirm=true after showing the user and receiving explicit approval for the exact frozen recipients, subject, body, deductions, return amount, and attachments. The delivery ID is idempotent; after an uncertain response, read get_hosting_order before retrying.",
    inputSchema: z.object({ orderId, deliveryId: z.uuid(), confirm: z.literal(true) }), annotations: { ...confirmed, openWorldHint: true },
  }, async ({ orderId: id, deliveryId }) => {
    await authorize(supabase, caller, "send_hosting_settlement_email", "write", id);
    return result(await deliverHostingEmails(id, [deliveryId]));
  });

  server.registerTool("record_hosting_deposit_return", {
    description: "Record that the remaining deposit balance was actually returned. This does not transfer money. The itemized notice must already be sent and the planned return date must have arrived. Read get_hosting_order, state the exact amount/method/date, and obtain explicit confirmation first.",
    inputSchema: z.object({ orderId, confirm: z.literal(true) }), annotations: confirmed,
  }, async ({ orderId: id }) => {
    await authorize(supabase, caller, "record_hosting_deposit_return", "write", id);
    return result(await recordHostingDepositReturn(id));
  });
}
