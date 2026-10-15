import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadIssue } from "./store";

export async function loadPublishedIssue(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await createAdminClient().from("nu_news_publications").select("issue_id").eq("issue_id", id).maybeSingle();
  if (error?.code === "PGRST205") return null;
  if (error) throw new Error("This newsletter could not be loaded. Please try again.");
  if (!data) return null;
  const issue = await loadIssue(id);
  return issue?.finalized_at && issue.final_pdf_path ? issue : null;
}
