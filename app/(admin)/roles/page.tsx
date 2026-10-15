import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/brand/app-nav";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import type { RoleAppAccess } from "@/lib/app-access";
import { AccessMatrix } from "./access-matrix";

export const metadata: Metadata = { title: "Roles" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await requireAppAccess("roles");
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_app_access").select("role_key, app_key, access_level");
  if (error) throw new Error("Unable to load role access. Please refresh and try again.");
  return (
    <div data-brand className="min-h-screen">
      <AppNav homeHref="/" title="Theta Xi" subtitle="Admin" tabs={[
        ...(session.appAccess.users !== "none" ? [{ href: "/users", label: "Users" }] : []),
        { href: "/roles", label: "Roles" },
      ]} />
      <main className="max-w-[1440px] mx-auto px-6 py-8 grid gap-6">
        <div>
          <h1 className="page-title">Roles</h1>
          <p className="page-lede">Set each role’s access to each app. Changes save automatically.</p>
          {session.appAccess.users !== "none" && <Link className="text-brand underline underline-offset-4" href="/users">Assign roles to users</Link>}
        </div>
        <div className="grid gap-2 text-sm text-muted">
          <p>None blocks access. Read allows viewing. Write allows viewing and changes.</p>
          <p>People receive the highest access from all their roles. Executive roles also include Brother and Executive member.</p>
          <p>Base member is an account role, separate from chapter membership. Administrators always have write access to every app.</p>
        </div>
        {session.appAccess.roles !== "write" && <p className="helper-text">You have read access. You cannot change these settings.</p>}
        <section className="card min-w-0" aria-label="Role permissions">
          <AccessMatrix permissions={data as RoleAppAccess[]} canWrite={session.appAccess.roles === "write"} />
        </section>
      </main>
    </div>
  );
}
