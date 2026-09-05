"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { getCookieOptions } from "@/lib/reimbursements/supabase/cookie-options";
import { getSupabaseConfig } from "@/lib/reimbursements/supabase/config";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
    cookieOptions: getCookieOptions(),
  });
}
