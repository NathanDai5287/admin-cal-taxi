import "server-only";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { fromSupabaseUrl, withOAuthProtectedResource, withSupabase } from "@supabase/server";
import { z } from "zod";

import type { Database } from "@/lib/reimbursements/supabase/database.types";

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

function createFinanceServer(
  supabase: import("@supabase/supabase-js").SupabaseClient<Database>,
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
      const { data, error } = await supabase.rpc("mcp_finance_overview");
      if (error) throw new Error("The finance overview could not be loaded.");
      return jsonResult(data);
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
      const { data, error } = await supabase.rpc("mcp_budget_categories");
      if (error) throw new Error("The budget categories could not be loaded.");
      return jsonResult(data);
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
      const { data, error } = await supabase.rpc("mcp_open_dues");
      if (error) throw new Error("The open dues balances could not be loaded.");
      return jsonResult(data);
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
      const handler = createMcpHandler(
        () => createFinanceServer(context.supabase),
        { onerror: (error) => console.error("MCP request failed", error) },
      );
      return handler.fetch(request);
    },
  ));
}
