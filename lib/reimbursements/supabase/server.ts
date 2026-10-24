import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { getCookieOptions } from "@/lib/reimbursements/supabase/cookie-options";
import { getSupabaseConfig } from "@/lib/reimbursements/supabase/config";
import { VIEW_AS_COOKIE, VIEW_AS_HEADER } from "@/lib/app-access";
import { sessionFetch } from "@/lib/reimbursements/supabase/view-as";

export async function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  const viewAsRole = cookieStore.get(VIEW_AS_COOKIE)?.value;

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: getCookieOptions(),
    global: { fetch: sessionFetch, headers: viewAsRole ? { [VIEW_AS_HEADER]: viewAsRole } : {} },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  });
}
