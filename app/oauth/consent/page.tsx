import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const metadata = { title: "Connect an AI client" };
export const dynamic = "force-dynamic";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const authorizationId = (await searchParams).authorization_id?.trim();
  if (!authorizationId) {
    return <ConsentMessage title="Invalid request">The connection request is missing its authorization identifier.</ConsentMessage>;
  }

  const session = await getSessionProfile();
  if (!session) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/reimbursements/login?next=${encodeURIComponent(next)}`);
  }
  if (session.profile.role !== "admin") {
    return <ConsentMessage title="Administrator access required">Only active administrators can connect app data.</ConsentMessage>;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return <ConsentMessage title="Invalid request">This connection request expired or is not valid.</ConsentMessage>;
  }
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  return (
    <main className="mx-auto max-w-[560px] px-6 py-16" data-brand>
      <section className="card">
        <div className="card-header">
          <span className="card-title">Connect {data.client.name}</span>
          <span className="card-subtitle">Administrator access</span>
        </div>
        <div className="card-body grid gap-5 border-t border-rule pt-5">
          <p className="m-0 text-[13.5px] leading-relaxed text-muted">
            This client can read and change finance, reimbursement, and member records as you.
          </p>
          <dl className="grid gap-3 text-[13px]">
            <div><dt className="font-bold text-ink">Client</dt><dd className="mt-1 text-muted">{data.client.name}</dd></div>
            <div><dt className="font-bold text-ink">Return address</dt><dd className="mt-1 break-all text-muted">{data.redirect_uri}</dd></div>
            <div><dt className="font-bold text-ink">Requested access</dt><dd className="mt-1 text-muted">{data.scope || "Account access"}</dd></div>
          </dl>
          <p className="m-0 text-[12px] leading-relaxed text-muted">
            It must ask for confirmation before deletions. You can remove its access later from Connected AI clients.
          </p>
          <form action="/api/oauth/decision" className="flex flex-wrap gap-3" method="post">
            <input name="authorization_id" type="hidden" value={authorizationId} />
            <button className="brand-button btn-primary" name="decision" type="submit" value="approve">Allow access</button>
            <button className="brand-button btn-ghost" name="decision" type="submit" value="deny">Deny</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function ConsentMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[520px] px-6 py-16" data-brand>
      <section className="card">
        <div className="card-header"><span className="card-title">{title}</span></div>
        <div className="card-body border-t border-rule pt-5 text-[13.5px] text-muted">{children}</div>
      </section>
    </main>
  );
}
