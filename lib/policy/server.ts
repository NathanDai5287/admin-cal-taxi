import "server-only";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

export function policyEnabled() { return process.env.POLICY_ASSISTANT_ENABLED === "true"; }
export async function requirePolicyMember() {
  if (!policyEnabled()) notFound();
  const session = await requireMember("/");
  if (session.profile.role !== "admin" && process.env.POLICY_ASSISTANT_MEMBERS_ENABLED !== "true") notFound();
  return session;
}
// Isolated schema follows the migration; reads/searches still use the user's RLS session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function policyClient(): Promise<any> { return await createClient() as any; }

export function questionLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
