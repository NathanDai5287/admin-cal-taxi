import "server-only";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { fromSupabaseUrl, withOAuthProtectedResource, withSupabase } from "@supabase/server";
import { z } from "zod";

import { incomeSources } from "@/lib/reimbursements/financial-report";
import { categoryValues, formatCategory } from "@/lib/reimbursements/format";
import { sendDiscordDuesAnnouncement } from "@/lib/reimbursements/discord";
import { sendInviteEmails } from "@/lib/reimbursements/send-invite-email";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import type { Database, Json } from "@/lib/reimbursements/supabase/database.types";
import { isCalendarDate } from "@/lib/mcp/finance";

type Supabase = import("@supabase/supabase-js").SupabaseClient<Database>;

function requiredEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error("The MCP server environment is incomplete.");
  }
  return {
    url,
    publishableKeys: { default: publishableKey },
    secretKeys: { default: secretKey },
    jwks: new URL(`${url}/auth/v1/.well-known/jwks.json`),
  };
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function addCategoryLabels(value: Json): Json {
  if (Array.isArray(value)) return value.map(addCategoryLabels);
  if (!value || typeof value !== "object") return value;

  const labeled = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === undefined ? undefined : addCategoryLabels(item)]),
  );
  if (typeof value.category === "string") labeled.categoryLabel = formatCategory(value.category);
  return labeled;
}

const date = z.string().refine(isCalendarDate, "Enter a real calendar date in YYYY-MM-DD format.");
const money = z.number().positive().max(999_999_999.99);
const requestId = z.uuid().describe("A new UUID. Reuse it only when retrying this exact request.");
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

async function read(supabase: Supabase, resource: string) {
  const { data, error } = await supabase.rpc("mcp_admin_read", { p_resource: resource });
  if (error) throw new Error(`The ${resource.replaceAll("_", " ")} could not be loaded.`);
  return jsonResult(addCategoryLabels(data));
}

async function write(
  supabase: Supabase,
  action: string,
  payload: Record<string, Json | undefined>,
  options: { confirmed?: boolean; requestId?: string } = {},
) {
  return jsonResult(await mutate(supabase, action, payload, options));
}

async function mutate(
  supabase: Supabase,
  action: string,
  payload: Record<string, Json | undefined>,
  options: { confirmed?: boolean; requestId?: string } = {},
) {
  const { data, error } = await supabase.rpc("mcp_admin_write", {
    p_action: action,
    p_payload: payload,
    p_request_id: options.requestId,
    p_confirmed: options.confirmed,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function beginExternal(
  supabase: Supabase,
  action: string,
  payload: Record<string, Json | undefined>,
  requestId: string,
) {
  const { data, error } = await supabase.rpc("mcp_begin_external", {
    p_action: action, p_payload: payload, p_request_id: requestId, p_confirmed: true,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function finishExternal(supabase: Supabase, requestId: string, succeeded: boolean, result: Json = {}) {
  const { error } = await supabase.rpc("mcp_finish_external", {
    p_request_id: requestId, p_succeeded: succeeded, p_result: result,
  });
  if (error) throw new Error(error.message);
}

function createFinanceServer(supabase: Supabase) {
  const server = new McpServer({ name: "cal.taxi administration", version: "2.0.0" });

  server.registerTool(
    "get_finance_overview",
    {
      description: "Get the current chapter cash, income, spending, receivables, and unpaid reimbursements.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await supabase.rpc("mcp_finance_overview");
      if (error) throw new Error("The finance overview could not be loaded.");
      return jsonResult(addCategoryLabels(data));
    },
  );

  server.registerTool(
    "list_budget_categories",
    {
      description: "List each finance category with its budget, approved spending, and remaining amount.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await supabase.rpc("mcp_budget_categories");
      if (error) throw new Error("The budget categories could not be loaded.");
      return jsonResult(addCategoryLabels(data));
    },
  );

  server.registerTool(
    "list_open_dues",
    {
      description: "List current member dues balances with assessment, payment, outstanding amount, and due date.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await supabase.rpc("mcp_open_dues");
      if (error) throw new Error("The open dues balances could not be loaded.");
      return jsonResult(data);
    },
  );

  server.registerTool("list_members", {
    description: "List active members and invited members, including stable IDs for write tools.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(supabase, "members"));

  server.registerTool("list_reimbursements", {
    description: "List reimbursement records and stable IDs for review and payment tools.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(supabase, "reimbursements"));

  server.registerTool("list_member_charges", {
    description: "List all open and paid member charges with stable IDs.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(supabase, "member_charges"));

  server.registerTool("list_finance_activity", {
    description: "List recorded income, forecasts, and manual expenses with stable IDs.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(supabase, "finance_activity"));

  server.registerTool("add_member_charges", {
    description: "Add the same charge to one or more active or invited members.",
    inputSchema: z.object({
      members: z.array(z.object({ memberId: z.uuid(), notes: z.string().trim().max(500).default("") }))
        .min(1).max(500).refine((members) => new Set(members.map(({ memberId }) => memberId)).size === members.length),
      amount: money,
      dueDate: date,
      requestId,
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ members, amount, dueDate, requestId }) => write(
    supabase, "add_charges", { members, amount, dueDate }, { requestId },
  ));

  server.registerTool("update_member_charge", {
    description: "Change a member charge, its member, outstanding amount, due date, or notes.",
    inputSchema: z.object({
      chargeId: z.uuid(), memberId: z.uuid(), amountOwed: money, dueDate: date,
      notes: z.string().trim().max(500).default(""),
    }),
    annotations: writeAnnotations,
  }, async ({ amountOwed, ...input }) => write(supabase, "update_charge", { ...input, amount: amountOwed }));

  server.registerTool("record_member_credit", {
    description: "Record a payment or credit against a member charge without exceeding its balance.",
    inputSchema: z.object({ chargeId: z.uuid(), amount: money, requestId }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ requestId, ...payload }) => write(supabase, "record_credit", payload, { requestId }));

  server.registerTool("set_member_charge_paid", {
    description: "Mark a member charge fully paid or reopen it with no recorded payment.",
    inputSchema: z.object({ chargeId: z.uuid(), paid: z.boolean(), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ confirm, ...input }) => write(supabase, "set_charge_paid", input, { confirmed: confirm }));

  server.registerTool("delete_member_charges", {
    description: "Permanently delete one or more member charges. Set confirm to true after the user approves the exact IDs.",
    inputSchema: z.object({ chargeIds: z.array(z.uuid()).min(1).max(200), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ chargeIds, confirm }) => write(supabase, "delete_charges", { chargeIds }, { confirmed: confirm }));

  server.registerTool("add_finance_entry", {
    description: "Record chapter income or add a budget forecast.",
    inputSchema: z.object({
      kind: z.enum(["income", "forecast"]), amount: money,
      description: z.string().trim().min(1).max(500),
      source: z.enum(incomeSources.map(([value]) => value)), date, requestId,
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ requestId, ...payload }) => write(supabase, "add_ledger_entry", payload, { requestId }));

  server.registerTool("delete_finance_entry", {
    description: "Permanently delete a recorded income or forecast entry.",
    inputSchema: z.object({ entryId: z.uuid(), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ entryId, confirm }) => write(supabase, "delete_ledger_entry", { entryId }, { confirmed: confirm }));

  server.registerTool("add_manual_expense", {
    description: "Record an expense without a receipt image.",
    inputSchema: z.object({
      category: z.enum(categoryValues), amount: money,
      description: z.string().trim().min(1).max(500), date, requestId,
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ requestId, ...payload }) => write(supabase, "add_expense", payload, { requestId }));

  server.registerTool("delete_manual_expense", {
    description: "Permanently delete a manual expense and its receipt reference.",
    inputSchema: z.object({ expenseId: z.uuid(), requestId, confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ expenseId, requestId, confirm }) => {
    const result = await mutate(supabase, "delete_expense", { expenseId }, { requestId, confirmed: confirm });
    const parsed = z.object({ receiptPath: z.string().nullable() }).parse(result);
    if (parsed.receiptPath) {
      const { error } = await createAdminClient().storage.from("receipts").remove([parsed.receiptPath]);
      if (error) throw new Error("The expense was removed, but its receipt image could not be removed.");
    }
    return jsonResult(result);
  });

  server.registerTool("set_opening_cash", {
    description: "Set the chapter opening cash balance for the current term.",
    inputSchema: z.object({ amount: z.number().min(0).max(999_999_999.99) }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async (input) => write(supabase, "set_opening_cash", input));

  server.registerTool("set_category_budget", {
    description: "Set or clear the semester budget for one expense category.",
    inputSchema: z.object({ category: z.enum(categoryValues), amount: z.number().min(0).max(999_999_999.99).nullable() }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async (input) => write(supabase, "set_budget", input));

  server.registerTool("update_reimbursement", {
    description: "Approve or deny a reimbursement, change its merchant or category, or mark it paid or unpaid.",
    inputSchema: z.object({
      reimbursementId: z.uuid(), status: z.enum(["approved", "denied"]).optional(),
      merchant: z.string().trim().min(1).max(200).optional(), category: z.enum(categoryValues).optional(),
      paid: z.boolean().optional(), confirm: z.boolean().default(false),
    }).refine(({ status, merchant, category, paid }) => status !== undefined || merchant !== undefined || category !== undefined || paid !== undefined)
      .refine(({ status, paid, confirm }) => (status !== "denied" && paid !== false) || confirm),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ confirm, ...input }) => write(supabase, "update_reimbursement", input, { confirmed: confirm }));

  server.registerTool("invite_user", {
    description: "Create or restore a member invitation and send its email.",
    inputSchema: z.object({
      email: z.email().max(200), role: z.enum(["member", "admin"]), requestId, confirm: z.literal(true),
    }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ requestId, confirm, ...payload }) => {
    const saved = await mutate(supabase, "invite_user", payload, { requestId, confirmed: confirm });
    const external = z.object({ shouldSend: z.boolean(), status: z.string().optional() })
      .passthrough().parse(await beginExternal(supabase, "send_invite_email", payload, requestId));
    if (!external.shouldSend) return jsonResult({ ...saved as Record<string, Json>, emailStatus: external.status });
    try {
      await sendInviteEmails([payload.email], payload.role, requestId);
      await finishExternal(supabase, requestId, true, { email: payload.email });
    } catch (error) {
      await finishExternal(supabase, requestId, false);
      throw error;
    }
    return jsonResult({ ...saved as Record<string, Json>, emailStatus: "sent" });
  });

  server.registerTool("set_user_role", {
    description: "Set an active or invited user's member or administrator role.",
    inputSchema: z.object({ userId: z.uuid(), role: z.enum(["member", "admin"]), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ confirm, ...input }) => write(supabase, "set_user_role", input, { confirmed: confirm }));

  server.registerTool("set_pending_user_name", {
    description: "Set an invited user's name before their first sign-in.",
    inputSchema: z.object({ userId: z.uuid(), name: z.string().trim().min(1).max(120) }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async (input) => write(supabase, "set_pending_user_name", input));

  server.registerTool("set_discord_user_id", {
    description: "Set or clear a member's Discord user ID.",
    inputSchema: z.object({ userId: z.uuid(), discordUserId: z.union([z.literal(""), z.string().regex(/^\d{15,22}$/)]) }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async (input) => write(supabase, "set_discord_user_id", input));

  server.registerTool("remove_user", {
    description: "Remove a member and revoke their app access. Their history remains stored.",
    inputSchema: z.object({ userId: z.uuid(), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ userId, confirm }) => write(supabase, "remove_user", { userId }, { confirmed: confirm }));

  server.registerTool("send_dues_announcement", {
    description: "Send a Discord announcement to selected members with linked outstanding charges.",
    inputSchema: z.object({
      chargeIds: z.array(z.uuid()).min(1).max(200), message: z.string().trim().min(1).max(1200),
      requestId, confirm: z.literal(true),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ chargeIds, message, requestId }) => {
    const prepared = await beginExternal(supabase, "send_dues_announcement", { chargeIds }, requestId);
    const parsed = z.object({
      recipients: z.array(z.object({ userId: z.string().regex(/^\d{15,22}$/), amountOwed: z.coerce.number().positive() })),
      shouldSend: z.boolean(), status: z.string().optional(),
    }).parse(prepared);
    if (!parsed.shouldSend) return jsonResult({ status: parsed.status });
    if (!parsed.recipients.length) {
      await finishExternal(supabase, requestId, false);
      throw new Error("No selected charge has an outstanding balance and linked Discord ID.");
    }
    const amounts = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const content = `${message}\n\n${parsed.recipients.map(({ userId, amountOwed }) => `<@${userId}> ${amounts.format(amountOwed)}`).join("\n")}`;
    if (content.length > 2000) {
      await finishExternal(supabase, requestId, false);
      throw new Error("The announcement is too long for Discord.");
    }
    let sent;
    try {
      sent = await sendDiscordDuesAnnouncement(content, parsed.recipients.map(({ userId }) => userId), requestId);
      await finishExternal(supabase, requestId, true, sent);
    } catch (error) {
      await finishExternal(supabase, requestId, false);
      throw error;
    }
    return jsonResult({ status: "sent", recipientCount: parsed.recipients.length, ...sent });
  });

  server.registerTool("bulk_mark_member_charges_paid", {
    description: "Mark several member charges fully paid.",
    inputSchema: z.object({ chargeIds: z.array(z.uuid()).min(1).max(200), confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ chargeIds, confirm }) => write(supabase, "bulk_set_charges_paid", { chargeIds }, { confirmed: confirm }));

  return server;
}

export function createMcpRouteHandler() {
  const environment = requiredEnvironment();
  const protectedResource = withOAuthProtectedResource({
    resourceServer: (request) => `${new URL(request.url).origin}/api/mcp`,
    authorizationServer: fromSupabaseUrl(environment.url),
  });
  return protectedResource(withSupabase<Database>(
    { auth: "user", env: environment },
    async (request, context) => {
      const handler = createMcpHandler(
        () => createFinanceServer(context.supabase),
        { onerror: (error) => console.error("MCP request failed", error) },
      );
      return handler.fetch(request);
    },
  ));
}
