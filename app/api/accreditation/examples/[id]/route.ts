import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!accreditationEnabled()) return new Response("Not found", { status: 404 });
  const session = await getSessionProfile();
  if (!session || !hasAppAccess(session, "accreditation", "read")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const db = createAccreditationAdminClient();
  const { data } = await db.from("accreditation_examples").select("storage_path,original_name,mime_type").eq("id", id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const downloaded = await db.storage.from("accreditation-examples").download(data.storage_path);
  if (downloaded.error) return new Response("Not found", { status: 404 });
  return new Response(await downloaded.data.arrayBuffer(), { headers: { "Content-Type": data.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.original_name)}` } });
}
