import { timingSafeEqual } from "node:crypto";
import { backendKey, backendOrigin } from "@/lib/host-backend";
import { workflowDb } from "@/lib/host-workflow";
import { sendCompletedContract } from "@/lib/host-email";

export async function POST(request: Request) {
  const expected = process.env.DOCUMENSO_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-documenso-secret");
  if (!expected || !supplied) return new Response("Unauthorized", { status: 401 });
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });
  const message = await request.json().catch(() => null) as {
    event?: string; payload?: { envelopeId?: string; externalId?: string };
  } | null;
  if (!message || !["DOCUMENT_SIGNED", "DOCUMENT_COMPLETED", "DOCUMENT_CANCELLED", "DOCUMENT_RECIPIENT_COMPLETED"].includes(message.event ?? "")) {
    return new Response(null, { status: 204 });
  }
  const revisionId = message.payload?.externalId;
  const envelopeId = message.payload?.envelopeId;
  if (!revisionId?.startsWith("sig_") || !envelopeId?.startsWith("envelope_")) {
    return new Response("Invalid notification", { status: 400 });
  }
  const origin = backendOrigin();
  const key = backendKey();
  if (!origin || !key) return new Response("Signing backend unavailable", { status: 503 });
  const response = await fetch(`${origin}/api/signing/notifications/${encodeURIComponent(revisionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": key },
    body: JSON.stringify({ envelopeId }), cache: "no-store", signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return new Response("Could not process notification", { status: 503 });
  const reference = await workflowDb().from("hosting_signing_references").select("order_id,envelope_id").eq("revision_id", revisionId).maybeSingle();
  if (reference.error) return new Response("Could not route completion email", { status: 503 });
  if (reference.data && reference.data.envelope_id === envelopeId) {
    try { await sendCompletedContract(reference.data.order_id, revisionId); }
    catch { return new Response("Completion email needs retry", { status: 503 }); }
  }
  return Response.json({ ok: true });
}
