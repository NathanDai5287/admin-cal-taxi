import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const supabase = createAccreditationAdminClient();
  const artifact = await supabase.from("accreditation_artifacts").select("storage_path, filename, mime_type, sha256").eq("id", id).maybeSingle();
  if (!artifact.data) return new Response("Not found", { status: 404 });
  const download = await supabase.storage.from("accreditation-artifacts").download(artifact.data.storage_path);
  if (download.error) return new Response("Not found", { status: 404 });
  return new Response(await download.data.arrayBuffer(), { headers: {
    "Cache-Control": "private, no-store",
    "Content-Type": artifact.data.mime_type,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.data.filename)}`,
    "X-Content-SHA256": artifact.data.sha256,
  } });
}
