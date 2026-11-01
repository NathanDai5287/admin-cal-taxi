import { requireAppAccess } from "@/lib/reimbursements/auth";
import { workflowDb } from "@/lib/host-workflow";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  await requireAppAccess("host", "read");
  const { id, index } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^(?:\d|1\d|2[0-5])$/.test(index)) return new Response("Invalid file", { status: 400 });
  const row = await workflowDb().from("hosting_email_deliveries").select("payload").eq("id", id).maybeSingle();
  const attachment = row.data?.payload?.body?.attachments?.[Number(index)] as { filename: string; content: string; contentType?: string } | undefined;
  if (row.error || !attachment) return new Response("File unavailable", { status: 404 });
  const contentType = attachment.contentType === "image/jpeg" ? "image/jpeg" : "application/pdf";
  return new Response(Buffer.from(attachment.content, "base64"), { headers: { "Content-Type": contentType, "Content-Disposition": `inline; filename="${attachment.filename.replace(/[^a-z0-9._-]/gi, "_")}"`, "Cache-Control": "private, no-store" } });
}
