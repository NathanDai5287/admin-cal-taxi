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
  const source = await supabase.from("accreditation_sources").select("storage_path, original_name, mime_type").eq("id", id).maybeSingle();
  if (!source.data) return new Response("Not found", { status: 404 });
  const download = await supabase.storage.from("accreditation-sources").download(source.data.storage_path);
  if (download.error) return new Response("Not found", { status: 404 });
  return new Response(await download.data.arrayBuffer(), { headers: {
    "Cache-Control": "private, no-store",
    "Content-Type": source.data.mime_type,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(source.data.original_name)}`,
    "X-Content-Type-Options": "nosniff",
  } });
}

