import Link from "next/link";
import "./alumni.css";
import { InviteForm } from "@/components/alumni-connect/invite-form";
import { AdminConnectAction } from "@/components/alumni-connect/admin-action";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { db, referralWindowStart } from "@/lib/alumni-connect/server";
import {
  manageConnectRecord,
  seedAlumniInvitations,
  syncConnectProvider,
} from "./actions";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const statuses: Record<string, string> = {
  pending: "Awaiting response",
  accepted: "Joined",
  declined: "Declined",
  revoked: "Withdrawn by chapter",
  suppressed: "Skipped - existing preference",
};
const deliveries: Record<string, string> = {
  reserved: "Sending reserved - not confirmed",
  sent: "Accepted by email service",
  uncertain: "Sending unknown - do not retry",
  not_sent: "Confirmed not sent",
};
const PAGE = 50;
type DirectoryDetails = {
  profile_id: string;
  first_name: string;
  last_name: string;
  roll_number: string;
  graduation_year: number | null;
  invited_count: number;
  invited_by: string;
};
export default async function AlumniInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    delivery?: string;
    view?: string;
  }>;
}) {
  const session = await requireAppAccess("users");
  const client = db();
  const params = await searchParams;
  const view =
    params.view === "invitations" || params.view === "alumni"
      ? params.view
      : "invite";
  const q = (params.q ?? "")
    .trim()
    .replace(/[^\w@.+ -]/g, "")
    .slice(0, 100);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const delivery = Object.hasOwn(deliveries, params.delivery ?? "")
    ? params.delivery!
    : "";
  let iq = client
    .from("connect_invitations")
    .select("id,email,status,delivery,inviter_name,created_at", {
      count: "exact",
    });
  let mq = client
    .from("connect_members")
    .select(
      "profile_id,email,subscribed,blocked,provider_checked_at,created_at",
      { count: "exact" },
    );
  if (q) {
    iq = iq.ilike("email", `%${q}%`);
    mq = mq.ilike("email", `%${q}%`);
  }
  if (delivery) iq = iq.eq("delivery", delivery);
  const [invitations, members, quota] = await Promise.all([
    iq
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * PAGE, page * PAGE - 1),
    mq
      .order("created_at", { ascending: false })
      .order("profile_id")
      .range((page - 1) * PAGE, page * PAGE - 1),
    client
      .from("connect_invitations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_id", session.userId)
      .gte("created_at", referralWindowStart()),
  ]);
  const canWrite = session.appAccess.users === "write" && !session.viewAsRole;
  if (invitations.error || members.error)
    return (
      <section className="card card-body">
        <h1 className="page-title">Alumni Connect setup needed</h1>
        <p>
          The Connect database could not be loaded. Apply the migration, or
          refresh if setup is complete.
        </p>
      </section>
    );
  const profileIds =
    view === "alumni" ? (members.data?.map((m) => m.profile_id) ?? []) : [];
  const [duplicateResult, directoryResult] = profileIds.length
    ? await Promise.all([
        client.rpc("connect_duplicate_candidates", { profile_ids: profileIds }),
        client.rpc("connect_alumni_directory_details", {
          profile_ids: profileIds,
        }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (directoryResult.error)
    throw new Error(
      "Unable to load alumni details. Please refresh and try again.",
    );
  const directory = new Map<string, DirectoryDetails>(
    (directoryResult.data ?? []).map((person: DirectoryDetails) => [
      person.profile_id,
      person,
    ]),
  );
  const duplicateMap = new Map<string, string>(
    (duplicateResult.data ?? []).map(
      (d: { profile_id: string; matches: string }) => [d.profile_id, d.matches],
    ),
  );
  const pages = Math.max(
    1,
    Math.ceil(
      (view === "alumni" ? (members.count ?? 0) : (invitations.count ?? 0)) /
        PAGE,
    ),
  );
  const href = (p: number) =>
    `/users/alumni?${new URLSearchParams({ q, delivery, view, page: String(p) })}`;
  return (
    <div
      className={`alumni-admin${view === "alumni" ? " alumni-admin--directory" : ""}`}
    >
      <header>
        <h1 className="page-title">Alumni Connect</h1>
        <p className="page-lede">
          Help your brothers stay connected with Nu Chapter.
        </p>
      </header>
      <nav className="alumni-view-nav" aria-label="Alumni Connect views">
        {[
          ["invite", "Invite brothers"],
          ["invitations", "Invitations"],
          ["alumni", "Alumni"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={
              key === "invite" ? "/users/alumni" : `/users/alumni?view=${key}`
            }
            aria-current={view === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === "invite" ? (
        <section className="alumni-compose" aria-label="Invite brothers">
          <div className="alumni-compose-heading">
            <h2>Invite your brothers</h2>
            <p>Add their details below. Only an email address is required.</p>
          </div>
          <InviteForm
            inviterName={session.profile.full_name}
            action={seedAlumniInvitations}
            disabled={!canWrite}
            remaining={Math.max(0, 50 - (quota.count ?? 0))}
          />
        </section>
      ) : (
        <>
          <form className="alumni-filters" action="/users/alumni">
            <input type="hidden" name="view" value={view} />
            <div className="field">
              <label className="field-label" htmlFor="connect-search">
                Find an email
              </label>
              <input
                id="connect-search"
                name="q"
                className="field-input"
                defaultValue={q}
                maxLength={100}
              />
            </div>
            {view === "invitations" && (
              <div className="field">
                <label className="field-label" htmlFor="connect-delivery">
                  Sending status
                </label>
                <select
                  id="connect-delivery"
                  name="delivery"
                  className="field-input"
                  defaultValue={delivery}
                >
                  <option value="">All invitations</option>
                  {Object.entries(deliveries).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="brand-button btn-primary" type="submit">
              Search
            </button>
          </form>
          {view === "invitations" && (
            <section className="grid gap-4">
              <h2 className="alumni-section-title">
                Invitations ({invitations.count ?? 0})
              </h2>
              <details className="alumni-help">
                <summary>About sending statuses</summary>
                <p className="helper-text">
                  Accepted by the email service does not mean delivered.
                  Reserved and unknown sends are never automatically resent.
                  Only confirmed not-sent addresses can be released.
                </p>
              </details>
              {!!invitations.data?.length && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Invited by</th>
                        <th>Response</th>
                        <th>Sending</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.data?.map((i) => (
                        <tr key={i.id}>
                          <td>{i.email}</td>
                          <td>{i.inviter_name || "Chapter"}</td>
                          <td>{statuses[i.status]}</td>
                          <td>{deliveries[i.delivery]}</td>
                          <td>
                            {canWrite && i.status === "pending" && (
                              <AdminConnectAction
                                label="Withdraw invitation"
                                explanation="The invitation link will stop working. The address will stay in invitation history and will not be invited again."
                                action={manageConnectRecord.bind(
                                  null,
                                  "revoke",
                                  i.id,
                                )}
                              />
                            )}{" "}
                            {canWrite &&
                              i.delivery === "not_sent" &&
                              i.status === "pending" && (
                                <AdminConnectAction
                                  label="Release unsent address"
                                  explanation="Resend confirmed this email was not sent. Release it so a corrected invitation can be submitted. Unknown sends cannot be released."
                                  action={manageConnectRecord.bind(
                                    null,
                                    "release_not_sent",
                                    i.id,
                                  )}
                                />
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!invitations.data?.length && (
                <div className="alumni-empty">
                  <h3>
                    {q || delivery
                      ? "No matching invitations"
                      : "No invitations yet"}
                  </h3>
                  <p>
                    {q || delivery
                      ? "Try a different email or sending status."
                      : "Invite your first brother to start reconnecting."}
                  </p>
                  {!q && !delivery && (
                    <Link href="/users/alumni">Invite brothers</Link>
                  )}
                </div>
              )}
            </section>
          )}
          {view === "alumni" && (
            <section className="grid gap-4">
              <div className="alumni-directory-toolbar">
                <h2 className="alumni-section-title">
                  Alumni ({members.count ?? 0})
                </h2>
                {canWrite && !!members.data?.length && (
                  <AdminConnectAction
                    label="Refresh statuses"
                    explanation="Read Resend preferences for these profiles and record provider opt-outs locally. This sends no email."
                    action={syncConnectProvider.bind(
                      null,
                      members.data.map((m) => m.profile_id),
                    )}
                  />
                )}
              </div>
              {!!members.data?.length && (
                <div
                  className="table-scroll alumni-directory-scroll"
                  role="region"
                  aria-label="Alumni directory"
                  tabIndex={0}
                >
                  <table className="data-table alumni-directory-table">
                    <thead>
                      <tr>
                        <th>First name</th>
                        <th>Last name</th>
                        <th>Email</th>
                        <th>Roll number</th>
                        <th>Class of</th>
                        <th>Invites sent</th>
                        <th>Invited by</th>
                        <th>Status</th>
                        {canWrite && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {members.data?.map((m) => (
                        <tr key={m.profile_id}>
                          <td>
                            {directory.get(m.profile_id)?.first_name || "—"}
                          </td>
                          <td>
                            {directory.get(m.profile_id)?.last_name || "—"}
                          </td>
                          <td>
                            {m.email}
                            {duplicateMap.has(m.profile_id) && (
                              <p className="text-sm text-warn">
                                Possible duplicate:{" "}
                                {duplicateMap.get(m.profile_id)}. Review in
                                People; never merge on name alone.
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {directory.get(m.profile_id)?.roll_number || "—"}
                          </td>
                          <td>
                            {directory.get(m.profile_id)?.graduation_year ??
                              "—"}
                          </td>
                          <td className="alumni-invite-count">
                            {directory.get(m.profile_id)?.invited_count ?? 0}
                          </td>
                          <td>
                            {directory.get(m.profile_id)?.invited_by ||
                              "Chapter"}
                          </td>
                          <td>
                            <span
                              className="alumni-member-status"
                              data-state={
                                m.blocked
                                  ? "blocked"
                                  : m.subscribed
                                    ? "subscribed"
                                    : "unsubscribed"
                              }
                            >
                              {m.blocked
                                ? "Access removed"
                                : m.subscribed
                                  ? "Subscribed"
                                  : "Unsubscribed"}
                            </span>
                            <span className="alumni-provider-check">
                              {m.provider_checked_at
                                ? `Checked ${new Date(m.provider_checked_at).toLocaleDateString()}`
                                : "Not checked"}
                            </span>
                          </td>
                          {canWrite && (
                            <td>
                              <details className="alumni-row-actions">
                                <summary aria-label={`Manage ${m.email}`}>
                                  Manage
                                </summary>
                                <AdminConnectAction
                                  label={
                                    m.blocked
                                      ? "Restore access"
                                      : "Remove access"
                                  }
                                  explanation={
                                    m.blocked
                                      ? "Allow code sign-in again. This sends no invitation and does not restore mailing consent. The profile must first be active in People."
                                      : "Stop Connect mail and referrals and revoke sessions. Access can be restored later; invitation history is retained."
                                  }
                                  action={manageConnectRecord.bind(
                                    null,
                                    m.blocked ? "unblock" : "block",
                                    m.profile_id,
                                  )}
                                />
                              </details>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!members.data?.length && (
                <div className="alumni-empty">
                  <h3>
                    {q ? "No matching alumni" : "No alumni have joined yet"}
                  </h3>
                  <p>
                    {q
                      ? "Try searching for a different email."
                      : "Brothers will appear here after they accept an invitation."}
                  </p>
                </div>
              )}
            </section>
          )}
          {pages > 1 && (
            <nav
              className="flex items-center gap-4"
              aria-label="Connect records pages"
            >
              {page > 1 && (
                <Link href={href(page - 1)} className="text-brand underline">
                  Previous
                </Link>
              )}
              <span>
                Page {page} of {pages} - 50 records per table
              </span>
              {page < pages && (
                <Link href={href(page + 1)} className="text-brand underline">
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
