import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { policyEnabled } from "@/lib/policy/server";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  const adminAccreditationAccess = session?.profile.role === "admin" && accreditationEnabled();
  if ((!policyEnabled() && !adminAccreditationAccess) || !session || !["admin", "member"].includes(session.profile.role) || (session.profile.role !== "admin" && process.env.POLICY_ASSISTANT_MEMBERS_ENABLED !== "true")) return new NextResponse("Not found", { status: 404 });
  const id = z.string().uuid().safeParse((await params).id);
  const date = z.iso.date().safeParse(new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10));
  if (!id.success || !date.success) return new NextResponse("Not found", { status: 404 });
  const db = createAccreditationAdminClient();
  let query = db.from("policy_documents").select("storage_path,original_name,mime_type").eq("id", id.data);
  if (session.profile.role !== "admin") query = query.eq("status", "published").eq("processing_state", "ready").lte("effective_from", date.data).or(`effective_until.is.null,effective_until.gte.${date.data}`);
  const doc = await query.maybeSingle();
  if (doc.error || !doc.data) return new NextResponse("Not found", { status: 404 });
  const file = await db.storage.from("policy-documents").download(doc.data.storage_path);
  if (file.error || !file.data) return new NextResponse("Not found", { status: 404 });
  // Authenticated streaming avoids reusable signed URLs after policy revocation.
  return new NextResponse(file.data, { headers: { "Content-Type": doc.data.mime_type, "Content-Disposition": `${doc.data.mime_type === "application/pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.data.original_name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}
