import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([getSessionProfile(), params]);
  if (!session || session.profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: expense } = await admin
    .from("reimbursement_manual_expenses")
    .select("receipt_path")
    .eq("id", id)
    .maybeSingle();
  if (!expense?.receipt_path) return new Response("Not found", { status: 404 });

  const { data } = await admin.storage.from("receipts").createSignedUrl(expense.receipt_path, 60);
  if (!data?.signedUrl) return new Response("Receipt unavailable", { status: 503 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
