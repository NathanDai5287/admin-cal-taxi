import { createMcpRouteHandler } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

function handler(request: Request) {
  return createMcpRouteHandler()(request, {});
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
