import { NextResponse } from "next/server";
import { previewHostingEmailAction } from "@/app/(admin)/host/orders/email-actions";

// A Route Handler lets independent background previews run concurrently;
// browser Server Actions are queued, including signature refreshes.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "Preview requests must originate from this app." }, { status: 403 });
  }
  const { id } = await params;
  let input;
  try { input = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid preview request." }, { status: 400 }); }
  const result = await previewHostingEmailAction({ ...input, orderId: id });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
