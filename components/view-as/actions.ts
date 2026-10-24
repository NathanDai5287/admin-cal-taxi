"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRoleKey } from "@/lib/app-access";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { VIEW_AS_COOKIE } from "@/lib/app-access";

export async function startViewAs(role: string) {
  const session = await getSessionProfile();
  const isAdmin = session?.profile.role === "admin" || session?.viewAsRole;
  if (!isAdmin || !isRoleKey(role) || role === "admin") throw new Error("Only administrators can view the app as another role.");
  (await cookies()).set(VIEW_AS_COOKIE, role, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  redirect("/");
}

export async function stopViewAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/roles");
}
