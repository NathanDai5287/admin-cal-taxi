import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { masterKeyFetch } from "@/lib/reimbursements/supabase/view-as";

function masterKeySettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("The Supabase secret key is not configured.");
  }

  return { url, secretKey, options: { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: masterKeyFetch } } };
}

export function createAdminClient() {
  const { url, secretKey, options } = masterKeySettings();
  return createClient<Database>(url, secretKey, options);
}

export function createUntypedAdminClient() {
  const { url, secretKey, options } = masterKeySettings();
  return createClient(url, secretKey, options);
}
