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
import {
  MCP_LINK_SECONDS, UPLOAD_LINK_SECONDS, addDraftPhoto, createIssue, curlUpload, deleteConfirmedDraft, editDraft, finalizeConfirmedDraft, finalizerFor,
  issueStatus, issueWithPhotoLinks, pdfLink, preparePhotoUpload, previewDraft, withArticleChanges, withFocus, withGalleryChanges,
  withGalleryPhoto, withHeadshot, withNewArticle, withoutArticle, withoutGalleryPhoto, withTitlePhoto,
} from "@/lib/mcp/nu-news";
import { MAX_MCP_PHOTO_MB } from "@/lib/mcp/nu-news-photo";
import { decodeMcpReceipt } from "@/lib/mcp/receipt";
import { PHOTO_LONG_EDGE_PX, issueSchema } from "@/lib/nu-news/issue";
import { listIssues } from "@/lib/nu-news/store";
import { registerMailingTools } from "@/lib/mcp/mailing-list";
import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AppKey, type RoleKey } from "@/lib/app-access";
import { EXECUTIVE_ROLE_OPTIONS, MEMBERSHIP_OPTIONS, type ExecutiveRole, type Membership } from "@/lib/people";

type Supabase = import("@supabase/supabase-js").SupabaseClient<Database>;
type McpCaller = { userId: string; clientId: string };

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
const readAnnotations = { ...writeAnnotations, readOnlyHint: true, idempotentHint: true };

async function read(supabase: Supabase, resource: string) {
  const { data, error } = await supabase.rpc("mcp_admin_read", { p_resource: resource });
  if (error) throw new Error(`The ${resource.replaceAll("_", " ")} could not be loaded.`);
  return jsonResult(addCategoryLabels(data));
}

async function rpcResult(call: PromiseLike<{ data: Json; error: { message: string } | null }>) {
  const { data, error } = await call;
  if (error) throw new Error(error.message);
  return data;
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

async function storeMcpReceipt(receiptDataUrl: string, requestId: string) {
  const receipt = decodeMcpReceipt(receiptDataUrl);
  const path = `mcp/${requestId}.${receipt.extension}`;
  const storage = createAdminClient().storage.from("receipts");
  const name = `${requestId}.${receipt.extension}`;
  const receiptExists = async () => {
    const { data } = await storage.list("mcp", { search: name, limit: 1 });
    return data?.some((object) => object.name === name) ?? false;
  };
  if (await receiptExists()) return path;

  const { error } = await storage.upload(path, receipt.bytes, { contentType: receipt.contentType, upsert: false });
  if (error && !await receiptExists()) throw new Error("The receipt image could not be uploaded.");
  return path;
}

export function createFinanceServer(supabase: Supabase, caller: McpCaller) {
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
    if (parsed.receiptPath?.startsWith("manual/")) {
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
    description: "Approve or deny a reimbursement, change its description, merchant, or category, or mark it paid or unpaid.",
    inputSchema: z.object({
      reimbursementId: z.uuid(), status: z.enum(["approved", "denied"]).optional(),
      merchant: z.string().trim().min(1).max(200).optional(), description: z.string().trim().min(1).max(2000).optional(), category: z.enum(categoryValues).optional(),
      paid: z.boolean().optional(), confirm: z.boolean().default(false),
    }).refine(({ status, merchant, description, category, paid }) => status !== undefined || merchant !== undefined || description !== undefined || category !== undefined || paid !== undefined)
      .refine(({ status, paid, confirm }) => (status !== "denied" && paid !== false) || confirm),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, async ({ confirm, ...input }) => write(supabase, "update_reimbursement", input, { confirmed: confirm }));

  server.registerTool("create_reimbursement", {
    description: "Create an approved reimbursement for an active or invited member and attach a JPG or PNG receipt image.",
    inputSchema: z.object({
      memberId: z.uuid(), category: z.enum(categoryValues), amount: money,
      description: z.string().trim().min(1).max(2000),
      paymentMethod: z.string().trim().min(1).max(200), paid: z.boolean().default(false),
      receiptDataUrl: z.string().max(14_000_000).describe("A data:image/jpeg;base64,... or data:image/png;base64,... URL up to 10 MB."),
      requestId,
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ receiptDataUrl, requestId, ...input }) => {
    const permission = await supabase.rpc("is_mcp_admin");
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const receiptPath = await storeMcpReceipt(receiptDataUrl, requestId);
    const { data, error } = await supabase.rpc("mcp_create_reimbursement", {
      p_member_id: input.memberId,
      p_category: input.category,
      p_amount: input.amount,
      p_description: input.description,
      p_payment_method: input.paymentMethod,
      p_receipt_path: receiptPath,
      p_paid: input.paid,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return jsonResult(data);
  });

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

  server.registerTool("list_role_access", {
    description: "List each role's access to each app, and each person's membership and executive positions. A person gets the highest access from all of their roles.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => jsonResult(await rpcResult(supabase.rpc("mcp_list_role_access"))));

  server.registerTool("set_role_access", {
    description: "Set one role's access to one app. Omit role to set every nonadministrator role at once. Roles: base member applies to everyone; brother, associate member, and alumni to that membership; exec_member to every brother with an executive position.",
    inputSchema: z.object({
      role: z.enum(ROLE_OPTIONS.map(({ key }) => key).filter((key) => key !== "admin") as [RoleKey, ...RoleKey[]]).optional(),
      app: z.enum(APP_OPTIONS.map(({ key }) => key) as [AppKey, ...AppKey[]]),
      access: z.enum(ACCESS_LEVELS),
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ role, app, access }) => jsonResult(await rpcResult(supabase.rpc("mcp_set_role_access", { p_role: role ?? null, p_app: app, p_access: access }))));

  server.registerTool("set_person_roles", {
    description: "Set a person's membership and executive positions. Only brothers can hold executive positions.",
    inputSchema: z.object({
      userId: z.uuid(),
      membership: z.enum(MEMBERSHIP_OPTIONS.map(({ value }) => value) as [Membership, ...Membership[]]).nullable(),
      executiveRoles: z.array(z.enum(EXECUTIVE_ROLE_OPTIONS.map(({ value }) => value) as [ExecutiveRole, ...ExecutiveRole[]])),
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ userId, membership, executiveRoles }) => jsonResult(await rpcResult(
    supabase.rpc("mcp_set_person_roles", { p_user_id: userId, p_membership: membership, p_executive_roles: executiveRoles }),
  )));

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

  registerNuNewsTools(server, supabase, caller);
  registerMailingTools(server, async (toolName, targetId) => {
    const app = toolName === "publish_nu_news_link" ? "nu-news" : "mailing-list";
    const level = ["list_mailing_lists", "get_mailing_list", "list_broadcasts", "get_broadcast", "get_broadcast_analytics"].includes(toolName) ? "read" : "write";
    const { data: allowed, error } = await supabase.rpc("has_mcp_app_access", { app_key: app, required_access: level });
    if (error || !allowed) throw new Error(`${app} ${level} access is required.`);
    const audit = await createAdminClient().from("mcp_audit_log").insert({ user_id: caller.userId, client_id: caller.clientId, tool_name: toolName, target_id: targetId });
    if (audit.error) throw new Error("The mailing list call could not be recorded.");
  });
  return server;
}

type NuNewsTarget = { issueId?: string; requestId?: string };

async function authorizeNuNewsCall(supabase: Supabase, caller: McpCaller, toolName: string, { issueId, requestId }: NuNewsTarget) {
  const readTools = ["list_nu_news_issues", "get_nu_news_issue", "get_nu_news_pdf_url"];
  const requiredAccess = readTools.includes(toolName) ? "read" : "write";
  const { data: allowed, error } = await supabase.rpc("has_mcp_app_access", { app_key: "nu-news", required_access: requiredAccess });
  if (error || !allowed) throw new Error(`Nu News ${requiredAccess} access is required.`);
  const audit = await createAdminClient().from("mcp_audit_log").insert({
    user_id: caller.userId, client_id: caller.clientId, tool_name: toolName, target_id: issueId, request_id: requestId,
  });
  if (audit.error) throw new Error("The Nu News call could not be recorded.");
}

const NU_NEWS_WORKFLOW = "Workflow: create_nu_news_issue; fill it with update_nu_news_issue and add_nu_news_article; "
  + "add the title photo, each author's headshot, and gallery photos: for each one, prepare_nu_news_photo_upload, upload the JPEG "
  + "to its uploadUrl (for example with curl), then attach its path; make_nu_news_preview and read the PDF; "
  + "fix photo warnings with set_nu_news_photo_focus; when missingItems is empty and the user approves, finalize_nu_news_issue. "
  + "The PDF prints each author's text exactly as given: never rewrite, correct, or shorten it.";
const EXACT_TEXT = "Copy each author's text exactly as given: never rewrite, correct, shorten, or reformat it. "
  + "In body, each non-empty line becomes a paragraph. "
  + "closing is the sign-off: each line prints on its own line, for example \"YITB,\" then the name.";
const PHOTO_RULES = `a JPEG up to ${MAX_MCP_PHOTO_MB} MB, at most ${PHOTO_LONG_EDGE_PX} pixels on the long side, upright, `
  + "with no metadata (no EXIF, XMP, IPTC, or comments)";
const ATTACH_PHOTO = "Pass the path from prepare_nu_news_photo_upload after you upload the photo to its uploadUrl. "
  + `The photo must be ${PHOTO_RULES}. Other photos are refused and deleted, with the steps to fix them. The photo's src is its path.`;
const LINK_LIFETIME = `The signed link expires after ${MCP_LINK_SECONDS / 60} minutes.`;

function registerNuNewsTools(server: McpServer, supabase: Supabase, caller: McpCaller) {
  const authorized = <Input extends NuNewsTarget>(toolName: string, run: (input: Input) => Promise<unknown>) => (
    async (input: Input) => {
      await authorizeNuNewsCall(supabase, caller, toolName, input);
      return jsonResult(await run(input));
    }
  );

  const issueId = z.uuid().describe("The issue ID from list_nu_news_issues or create_nu_news_issue.");
  const articleId = z.uuid().describe("The article ID from get_nu_news_issue.");
  const src = z.string().describe("The photo's src from get_nu_news_issue.");
  const position = z.int().min(1).optional().describe("Move it to this place in the list. 1 is first.");
  const path = z.string().describe("The path from prepare_nu_news_photo_upload, after the photo is uploaded.");
  const articleFields = issueSchema.shape.articles.element
    .pick({ title: true, author: true, roster: true, body: true, closing: true })
    .partial();

  server.registerTool("list_nu_news_issues", {
    description: "List Nu News newsletter issues, newest first, with season, issue date, draft or final status, preview time, "
      + `and who finalized each and when. ${NU_NEWS_WORKFLOW}`,
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, authorized("list_nu_news_issues", async () => ({
    issues: (await listIssues()).map((issue) => ({ ...issue, status: issueStatus(issue) })),
  })));

  server.registerTool("get_nu_news_issue", {
    description: "Get one Nu News issue: details, intro, articles with IDs, photos with src, focus [x, y], and viewUrl, donation text, "
      + "status, missingItems that block finalizing, and preview_made_at (null means no preview exists). "
      + `Download a photo's viewUrl to look at it before you choose its focus point with set_nu_news_photo_focus. ${LINK_LIFETIME}`,
    inputSchema: z.object({ issueId }),
    annotations: readAnnotations,
  }, authorized("get_nu_news_issue", ({ issueId }) => issueWithPhotoLinks(issueId)));

  server.registerTool("create_nu_news_issue", {
    description: "Create a draft Nu News issue, like New issue on the site: it copies the location and the donation text from the most recent issue. "
      + `The season defaults to the current semester and the date to today. Articles and photos start empty. ${NU_NEWS_WORKFLOW}`,
    inputSchema: z.object({
      season: issueSchema.shape.season.optional(), issueDate: date.optional(), location: issueSchema.shape.location.optional(), requestId,
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("create_nu_news_issue", async ({ requestId, issueDate, ...details }) => (
    createIssue(requestId, { ...details, issue_date: issueDate })
  )));

  server.registerTool("update_nu_news_issue", {
    description: "Change a draft issue's season, issue date, location, intro, or How to Donate section. Send only the fields to change; "
      + "intro and donate each replace both their heading and body. In each body, each non-empty line becomes one paragraph or donation item.",
    inputSchema: z.object({
      issueId, season: issueSchema.shape.season.optional(), issueDate: date.optional(), location: issueSchema.shape.location.optional(),
      intro: issueSchema.shape.intro.optional(), donate: issueSchema.shape.donate.optional(),
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("update_nu_news_issue", async ({ issueId, issueDate, ...changes }) => editDraft(
    issueId, (issue) => ({ ...issue, ...changes, issue_date: issueDate ?? issue.issue_date }),
  )));

  server.registerTool("add_nu_news_article", {
    description: `Add an article at the end of a draft issue. The article ID is the requestId. The sign-off defaults to "YITB,". ${EXACT_TEXT}`,
    inputSchema: articleFields.extend({ issueId, requestId }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("add_nu_news_article", async ({ issueId, requestId, ...fields }) => ({
    articleId: requestId, ...await editDraft(issueId, (issue) => withNewArticle(issue, requestId, fields)),
  })));

  server.registerTool("update_nu_news_article", {
    description: `Change an article's title, author, roster number, body, or sign-off (closing), or move it to another position. ${EXACT_TEXT}`,
    inputSchema: articleFields.extend({ issueId, articleId, position }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("update_nu_news_article", async ({ issueId, articleId, ...changes }) => editDraft(
    issueId, (issue) => withArticleChanges(issue, articleId, changes),
  )));

  server.registerTool("remove_nu_news_article", {
    description: "Remove an article, its text, and its headshot from a draft issue. Set confirm to true after the user approves.",
    inputSchema: z.object({ issueId, articleId, confirm: z.literal(true) }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, authorized("remove_nu_news_article", async ({ issueId, articleId }) => editDraft(
    issueId, (issue) => withoutArticle(issue, articleId),
  )));

  server.registerTool("prepare_nu_news_photo_upload", {
    description: `Prepare the upload of one photo to a draft issue. First prepare the photo: ${PHOTO_RULES}. `
      + "For example, with Python Pillow: im = ImageOps.exif_transpose(Image.open(src)).convert(\"RGB\"); "
      + `im.thumbnail((${PHOTO_LONG_EDGE_PX}, ${PHOTO_LONG_EDGE_PX})); im.save(dst, "JPEG", quality=82). `
      + "Then upload the JPEG bytes to uploadUrl with one HTTP PUT and the header content-type: image/jpeg: "
      + `${curlUpload("<uploadUrl>")}. Then pass path to set_nu_news_title_photo, set_nu_news_headshot, or add_nu_news_gallery_photo. `
      + `Use a new requestId for each photo. The upload link expires after ${UPLOAD_LINK_SECONDS / 3600} hours.`,
    inputSchema: z.object({ issueId, requestId }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("prepare_nu_news_photo_upload", async ({ issueId, requestId }) => preparePhotoUpload(issueId, requestId)));

  server.registerTool("set_nu_news_title_photo", {
    description: `Set the title photo of a draft issue, replacing any previous one. ${ATTACH_PHOTO}`,
    inputSchema: z.object({ issueId, path }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("set_nu_news_title_photo", async ({ issueId, path }) => addDraftPhoto(issueId, path, withTitlePhoto)));

  server.registerTool("set_nu_news_headshot", {
    description: `Set an article author's headshot, replacing any previous one. ${ATTACH_PHOTO}`,
    inputSchema: z.object({ issueId, articleId, path }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("set_nu_news_headshot", async ({ issueId, articleId, path }) => addDraftPhoto(
    issueId, path, (issue, src) => withHeadshot(issue, articleId, src),
  )));

  server.registerTool("add_nu_news_gallery_photo", {
    description: "Add a photo at the end of a draft issue's photo list. Photos fill the empty space at the bottom of article pages in order, "
      + `one to three per row, then the Photo Gallery pages. ${ATTACH_PHOTO}`,
    inputSchema: z.object({ issueId, path }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("add_nu_news_gallery_photo", async ({ issueId, path }) => addDraftPhoto(issueId, path, withGalleryPhoto)));

  server.registerTool("update_nu_news_gallery_photo", {
    description: "Change a gallery photo's options or move it to another position. feature is Full width: the photo waits for the gallery "
      + "and gets its own row there. donate is Donate photo: the photo goes above How to Donate, and only one photo can have it.",
    inputSchema: z.object({ issueId, src, feature: z.boolean().optional(), donate: z.boolean().optional(), position }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("update_nu_news_gallery_photo", async ({ issueId, src, ...changes }) => editDraft(
    issueId, (issue) => withGalleryChanges(issue, src, changes),
  )));

  server.registerTool("remove_nu_news_gallery_photo", {
    description: "Remove a photo from a draft issue's photo list.",
    inputSchema: z.object({ issueId, src }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, authorized("remove_nu_news_gallery_photo", async ({ issueId, src }) => editDraft(
    issueId, (issue) => withoutGalleryPhoto(issue, src),
  )));

  server.registerTool("set_nu_news_photo_focus", {
    description: "Choose the spot of a title photo, headshot, or gallery photo that stays in view when the photo is cropped. "
      + "Use it to fix photo warnings from make_nu_news_preview.",
    inputSchema: z.object({
      issueId, src,
      x: z.number().min(0).max(1).describe("0 is the left edge and 1 the right edge."),
      y: z.number().min(0).max(1).describe("0 is the top edge and 1 the bottom edge."),
    }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("set_nu_news_photo_focus", async ({ issueId, src, x, y }) => editDraft(
    issueId, (issue) => withFocus(issue, src, [x, y]),
  )));

  server.registerTool("make_nu_news_preview", {
    description: "Make the preview PDF of a draft issue. It replaces the previous preview and needs the "
      + "title photo and every headshot. Returns a link to the PDF, photoWarnings (photos that lose more than 30% when cropped: fix them "
      + "with set_nu_news_photo_focus or a better-shaped photo; warnings do not block finalizing), and the missingItems that block finalizing. "
      + LINK_LIFETIME,
    inputSchema: z.object({ issueId }),
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, authorized("make_nu_news_preview", async ({ issueId }) => previewDraft(issueId)));

  server.registerTool("finalize_nu_news_issue", {
    description: "Permanently finalize a draft issue: make the final PDF and lock the issue, its photos, and its PDF forever. "
      + "There are no corrections, new versions, or copies afterwards. Call it only after the user has read the latest preview and approved. "
      + "Set confirmSeason to the issue's season exactly. It is refused while missingItems is not empty. "
      + `Returns the final PDF's SHA-256 and a link to it. ${LINK_LIFETIME}`,
    inputSchema: z.object({ issueId, confirmSeason: z.string() }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, authorized("finalize_nu_news_issue", async ({ issueId, confirmSeason }) => (
    finalizeConfirmedDraft(issueId, confirmSeason, await finalizerFor(caller.userId))
  )));

  server.registerTool("delete_nu_news_draft", {
    description: "Permanently delete a draft issue, like Delete draft on the site: its text, its photos, and its preview PDF. "
      + "It works only on drafts: final issues can never be deleted. Call it only after the user asks to delete this draft. "
      + "Set confirmSeason to the issue's season exactly. Returns the removed files.",
    inputSchema: z.object({ issueId, confirmSeason: z.string() }),
    annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
  }, authorized("delete_nu_news_draft", async ({ issueId, confirmSeason }) => deleteConfirmedDraft(issueId, confirmSeason)));

  server.registerTool("get_nu_news_pdf_url", {
    description: `Get a link to the final PDF of a final issue, or to the latest preview PDF of a draft issue. ${LINK_LIFETIME}`,
    inputSchema: z.object({ issueId }),
    annotations: readAnnotations,
  }, authorized("get_nu_news_pdf_url", async ({ issueId }) => pdfLink(issueId)));
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
      const claims = context.jwtClaims!;
      const caller = { userId: claims.sub, clientId: String(claims.client_id) };
      const handler = createMcpHandler(
        () => createFinanceServer(context.supabase, caller),
        { onerror: (error) => console.error("MCP request failed", error) },
      );
      return handler.fetch(request);
    },
  ));
}
