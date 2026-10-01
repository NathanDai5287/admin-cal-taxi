import { requireAdmin } from "@/lib/reimbursements/auth";
import { signingFile } from "@/lib/host-signing";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string; revisionId: string; kind: string }> }) {
  await requireAdmin("/");
  const { orderId, revisionId, kind } = await context.params;
  if (kind !== "original" && kind !== "completed" && kind !== "audit") {
    return new Response("Not found", { status: 404 });
  }
  const backend = await signingFile(orderId, revisionId, kind);
  return new Response(backend.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${kind === "original" ? "inline" : "attachment"}; filename="${revisionId}-${kind}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
