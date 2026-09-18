import Link from "next/link";

import { Button } from "@/components/brand/button";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { revokeConnection } from "./actions";

export const metadata = { title: "Connected AI clients" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireAdmin("/");
  const [{ result }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: grants, error } = await supabase.auth.oauth.listGrants();

  return (
    <main className="mx-auto max-w-[780px] px-6 py-16" data-brand>
      <Link className="back-link" href="/">← Admin home</Link>
      <p className="page-eyebrow mt-6">Security</p>
      <h1 className="page-title">Connected AI clients</h1>
      <p className="page-lede">Review clients that can manage app data as your account.</p>
      {result === "revoked" ? <p className="form-message success mt-5">Client access removed.</p> : null}
      {result === "error" || result === "invalid" ? <p className="form-message mt-5">Client access could not be removed.</p> : null}
      <section className="card mt-8">
        <div className="card-header"><span className="card-title">Authorized clients</span></div>
        {error ? (
          <div className="empty-state border-t border-rule">Connection management is not available until OAuth is enabled.</div>
        ) : grants?.length ? (
          <ul className="m-0 grid list-none divide-y divide-rule border-t border-rule p-0">
            {grants.map((grant) => (
              <li className="flex flex-wrap items-center justify-between gap-4 px-6 py-5" key={grant.client.id}>
                <div>
                  <strong className="text-[14px] text-ink">{grant.client.name}</strong>
                  <p className="mt-1 text-[12px] text-muted">Connected {new Date(grant.granted_at).toLocaleDateString()}</p>
                </div>
                <form action={revokeConnection}>
                  <input name="clientId" type="hidden" value={grant.client.id} />
                  <Button compact type="submit" variant="danger">Remove access</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state border-t border-rule">No AI clients are connected.</div>
        )}
      </section>
    </main>
  );
}
