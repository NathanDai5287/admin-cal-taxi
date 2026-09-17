import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!accreditationEnabled()) return new Response("Not found", { status: 404 });
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const supabase = createAccreditationAdminClient();
  const template = await supabase.from("accreditation_templates").select("storage_path, original_name, mime_type").eq("id", id).maybeSingle();
  if (!template.data) return new Response("Not found", { status: 404 });
  const download = await supabase.storage.from("accreditation-templates").download(template.data.storage_path);
  if (download.error) return new Response("Not found", { status: 404 });
  return new Response(await download.data.arrayBuffer(), { headers: {
    "Cache-Control": "private, no-store",
    "Content-Type": template.data.mime_type,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(template.data.original_name)}`,
  } });
}

