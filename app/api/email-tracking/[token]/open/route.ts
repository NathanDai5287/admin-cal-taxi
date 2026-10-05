import { recordEmailEvent } from "@/lib/email-tracking";

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const headers = { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    await recordEmailEvent(token, "opened");
  } catch (error) {
    console.error("Email open tracking failed", error);
  }
  return new Response(pixel, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
