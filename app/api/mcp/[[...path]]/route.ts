import { createMcpRouteHandler } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
// The Nu News preview and finalize tools download the photos, make the PDF, and upload it.
export const maxDuration = 60;

function handler(request: Request) {
  return createMcpRouteHandler()(request, {});
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
