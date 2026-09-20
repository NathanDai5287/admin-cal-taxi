import { accreditationEnabled } from "@/lib/accreditation/feature";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!accreditationEnabled()) return new Response("Not found", { status: 404 });
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const supabase = createAccreditationAdminClient();
  const template = await supabase.from("accreditation_templates").select("storage_path, original_name, mime_type, preview_storage_path, format, analysis").eq("id", id).maybeSingle();
  if (!template.data) return new Response("Not found", { status: 404 });
  const preview = new URL(request.url).searchParams.get("kind") === "preview";
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const storagePath = preview ? template.data.preview_storage_path : template.data.storage_path;
  if (!storagePath) return new Response("Not found", { status: 404 });
  const download = await supabase.storage.from("accreditation-templates").download(storagePath);
  if (download.error) return new Response("Not found", { status: 404 });
  const isPdf = template.data.format === "pdf";
  const disposition = isPdf && inline ? "inline" : "attachment";
  return new Response(await download.data.arrayBuffer(), { headers: {
    "Cache-Control": "private, no-store",
    "Content-Type": preview ? ({ pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Record<string, string>)[template.data.format] : template.data.mime_type,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(preview ? `ai-preview.${template.data.format}` : template.data.original_name)}`,
    "X-Content-Type-Options": "nosniff",
    ...(isPdf && inline ? { "Content-Security-Policy": "sandbox" } : {}),
  } });
}

