import { timingSafeEqual } from "node:crypto";
import { ingestionEnabled, runIngestionWorker } from "@/lib/accreditation/ingestion";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request) {
  const secret = process.env.DOCUMENT_INGESTION_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Forbidden", { status: 403 });
  if (!ingestionEnabled()) return Response.json({ enabled: false });
  await runIngestionWorker();
  return Response.json({ ok: true });
}
