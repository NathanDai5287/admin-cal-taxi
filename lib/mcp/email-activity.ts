import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadEmailActivity } from "../email-tracking";
import { loadDuesEmailHistory } from "../reimbursements/dues-email-history";
import { createAdminClient } from "../reimbursements/supabase/admin";
import type { Database } from "../reimbursements/supabase/database.types";

export async function loadMcpEmailActivity(
  supabase: SupabaseClient<Database>,
  caller: { userId: string; clientId: string },
  relatedId?: string,
) {
  const admin = await supabase.rpc("is_mcp_admin");
  if (admin.error || !admin.data) throw new Error("Administrator access is required.");
  if (!relatedId || !z.uuid().safeParse(relatedId).success) return loadEmailActivity(relatedId);
  const finance = await supabase.rpc("has_mcp_app_access", { app_key: "finance", required_access: "read" });
  if (finance.error) throw new Error("Finance access could not be checked.");
  if (!finance.data) return loadEmailActivity(relatedId);
  const db = createAdminClient();
  const audit = await db.from("mcp_audit_log").insert({
    user_id: caller.userId, client_id: caller.clientId, tool_name: "list_email_activity", target_id: relatedId,
  });
  if (audit.error) throw new Error("The email activity request could not be recorded.");
  const charge = await db.from("chapter_receivables").select("id").eq("id", relatedId).maybeSingle();
  if (charge.error) throw new Error("The charge could not be loaded.");
  if (!charge.data) return loadEmailActivity(relatedId);
  return (await loadDuesEmailHistory(relatedId)).map((message) => ({ ...message, kind: "dues", relatedId }));
}
