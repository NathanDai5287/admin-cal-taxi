import { recordEmailEvent, trackingAddress } from "@/lib/email-tracking";
import { validTrackedLink } from "@/lib/email-tracking-links";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const query = new URL(request.url).searchParams;
  const url = query.get("url") || "";
  if (!validTrackedLink(trackingAddress(token), url, query.get("signature") || "")) {
    return new Response("Invalid email link.", { status: 400 });
  }
  try {
    await recordEmailEvent(token, "clicked", url);
  } catch (error) {
    console.error("Email click tracking failed", error);
  }
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export function HEAD() {
  return new Response(null, { headers: { "Cache-Control": "no-store" } });
}
