import type { Metadata } from "next";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import type { RoleAppAccess } from "@/lib/app-access";
import { AccessMatrix } from "./access-matrix";
import "./roles.css";

export const metadata: Metadata = { title: "Roles · Members" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await requireAppAccess("users");
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_app_access").select("role_key, app_key, access_level");
  if (error) throw new Error("Unable to load role access. Please refresh and try again.");
  return (
    <div className="roles-main">
      <header className="roles-heading">
        <div>
          <h1 className="page-title">Roles</h1>
        </div>
      </header>
      <div className="roles-guidance">
        <p className="roles-legend"><span><strong data-access="none">None</strong> adds no access.</span><span><strong data-access="read">Read</strong> allows viewing.</span><span><strong data-access="write">Write</strong> allows viewing and changes.</span></p>
      </div>
      {session.appAccess.users !== "write" && <p className="roles-read-notice">You have read access. You cannot change these settings.</p>}
      <section className="card min-w-0" aria-label="Role permissions">
        <AccessMatrix permissions={data as RoleAppAccess[]} canWrite={session.appAccess.users === "write"} />
      </section>
    </div>
  );
}
