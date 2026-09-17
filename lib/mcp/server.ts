import "server-only";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { fromSupabaseUrl, withOAuthProtectedResource, withSupabase } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildBudgetCategories, buildFinanceOverview } from "@/lib/mcp/finance";
import type { Database } from "@/lib/reimbursements/supabase/database.types";

type McpIdentity = {
  userId: string;
  clientId: string;
};

type McpToolName = Database["public"]["Tables"]["mcp_audit_log"]["Insert"]["tool_name"];

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

async function requireActiveAdmin(
  supabase: SupabaseClient<Database>,
  identity: McpIdentity,
) {
  if (!identity.clientId) throw new Error("This access token is not an OAuth client token.");
  const { data, error } = await supabase
    .from("profiles")
    .select("role, removed_at")
    .eq("id", identity.userId)
    .maybeSingle();
  if (error || data?.role !== "admin" || data.removed_at) {
    throw new Error("An active administrator account is required.");
  }
}

async function recordAudit(
  supabase: SupabaseClient<Database>,
  identity: McpIdentity,
  toolName: McpToolName,
) {
  const { error } = await supabase.from("mcp_audit_log").insert({
    user_id: identity.userId,
    client_id: identity.clientId,
    tool_name: toolName,
  });
  if (error) throw new Error("The MCP audit record could not be saved.");
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function createFinanceServer(
  supabase: SupabaseClient<Database>,
  identity: McpIdentity,
) {
  const server = new McpServer({ name: "cal.taxi finance", version: "1.0.0" });

  server.registerTool(
    "get_finance_overview",
    {
      description: "Get the current chapter cash, income, spending, receivables, and unpaid reimbursements.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      await requireActiveAdmin(supabase, identity);
      const [settings, income, reimbursements, manualExpenses, receivables] = await Promise.all([
        supabase.from("chapter_financial_settings").select("opening_cash").eq("id", true).maybeSingle(),
        supabase.from("reimbursement_budget_entries").select("amount").eq("kind", "income"),
        supabase.from("reimbursements").select("amount, status, reimbursed"),
        supabase.from("reimbursement_manual_expenses").select("amount"),
        supabase.from("chapter_receivables").select("amount_assessed, amount_paid"),
      ]);
      const error = [settings, income, reimbursements, manualExpenses, receivables]
        .find((result) => result.error)?.error;
      if (error) throw new Error("The finance overview could not be loaded.");
      await recordAudit(supabase, identity, "get_finance_overview");
      return jsonResult(buildFinanceOverview({
        openingCash: settings.data?.opening_cash ?? 0,
        income: (income.data ?? []).map((row) => row.amount),
        reimbursements: reimbursements.data ?? [],
        manualExpenses: (manualExpenses.data ?? []).map((row) => row.amount),
        receivables: (receivables.data ?? []).map((row) => ({
          amountAssessed: row.amount_assessed,
          amountPaid: row.amount_paid,
        })),
      }));
    },
  );

  server.registerTool(
    "list_budget_categories",
    {
      description: "List each finance category with its budget, approved spending, and remaining amount.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      await requireActiveAdmin(supabase, identity);
      const [budgets, reimbursements, manualExpenses] = await Promise.all([
        supabase.from("reimbursement_budgets").select("budget_key, amount"),
        supabase.from("reimbursements").select("category, amount, status"),
        supabase.from("reimbursement_manual_expenses").select("category, amount"),
      ]);
      const error = [budgets, reimbursements, manualExpenses].find((result) => result.error)?.error;
      if (error) throw new Error("The budget categories could not be loaded.");
      await recordAudit(supabase, identity, "list_budget_categories");
      return jsonResult({
        currency: "USD",
        categories: buildBudgetCategories(
          (budgets.data ?? []).map((row) => ({ budgetKey: row.budget_key, amount: row.amount })),
          reimbursements.data ?? [],
          manualExpenses.data ?? [],
        ),
      });
    },
  );

  server.registerTool(
    "list_open_dues",
    {
      description: "List current member dues balances with assessment, payment, outstanding amount, and due date.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      await requireActiveAdmin(supabase, identity);
      const { data, error } = await supabase
        .from("chapter_receivables")
        .select("member_name, amount_assessed, amount_paid, due_date")
        .order("due_date")
        .order("member_name");
      if (error) throw new Error("The open dues balances could not be loaded.");
      const balances = (data ?? []).map((row) => ({
        memberName: row.member_name,
        amountAssessed: Number(row.amount_assessed),
        amountPaid: Number(row.amount_paid),
        outstanding: Math.max(0, Number(row.amount_assessed) - Number(row.amount_paid)),
        dueDate: row.due_date,
      })).filter((row) => row.outstanding > 0);
      await recordAudit(supabase, identity, "list_open_dues");
      return jsonResult({ currency: "USD", balances });
    },
  );

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
      const identity = {
        userId: context.userClaims?.id ?? "",
        clientId: typeof context.jwtClaims?.client_id === "string"
          ? context.jwtClaims.client_id
          : "",
      };
      const handler = createMcpHandler(
        () => createFinanceServer(context.supabase, identity),
        { onerror: (error) => console.error("MCP request failed", error) },
      );
      return handler.fetch(request);
    },
  ));
}
