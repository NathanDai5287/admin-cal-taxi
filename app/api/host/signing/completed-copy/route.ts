import { backendKey, backendOrigin } from "@/lib/host-backend";

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({})) as { token?: string };
  if (!token || token.length > 100) return new Response("Invalid link", { status: 400 });
  const origin = backendOrigin();
  const key = backendKey();
  if (!origin || !key) return new Response("Service unavailable", { status: 503 });
  const response = await fetch(`${origin}/api/signing/completed-copy`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": key },
    body: JSON.stringify({ token }), cache: "no-store", signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 409) return new Response("The completed copy will be available after everyone signs.", { status: 409 });
  if (!response.ok) return new Response("Invalid or expired link", { status: 404 });
  return new Response(response.body, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=completed-hosting-contract.pdf",
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
