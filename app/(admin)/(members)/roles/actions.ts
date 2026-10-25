"use server";

import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AccessLevel, type AppKey, type RoleKey } from "@/lib/app-access";
import { createClient } from "@/lib/reimbursements/supabase/server";

export async function setRoleAppAccess(role: RoleKey, app: AppKey, access: AccessLevel): Promise<{ error?: string }> {
  if (!ROLE_OPTIONS.some(({ key }) => key === role) || role === "admin") return { error: "Choose an editable role." };
  if (!APP_OPTIONS.some(({ key }) => key === app) || !ACCESS_LEVELS.includes(access)) return { error: "Choose a valid app and access level." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role_app_access", { role_key: role, app_key: app, access_level: access });
  if (error) return { error: "Unable to save access. Please try again." };
  return {};
}
