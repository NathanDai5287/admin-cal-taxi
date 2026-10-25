"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRoleKey, VIEW_AS_COOKIE } from "@/lib/app-access";

// The cookie only takes effect for administrators: the session loader and the
// database both ignore it for everyone else.
export async function startViewAs(role: string, openHome: boolean) {
  if (!isRoleKey(role) || role === "admin") throw new Error("Choose a role to view as.");
  (await cookies()).set(VIEW_AS_COOKIE, role, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  if (openHome) redirect("/");
}

export async function stopViewAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/roles");
}
