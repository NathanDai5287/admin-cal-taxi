import Link from "next/link";
import { Button } from "@/components/brand/button";
import { InviteForm } from "@/components/alumni-connect/invite-form";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { db } from "@/lib/alumni-connect/server";
import {
  revokeAlumniInvitation,
  removeAlumniSubscription,
  seedAlumniInvitations,
} from "./actions";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function AlumniInvitationsPage() {
  const session = await requireAppAccess("users");
  const client = db();
  const [invitations, members] = await Promise.all([
    client
      .from("connect_invitations")
      .select("id,email,status,delivery,inviter_name,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("connect_members")
      .select("profile_id,email,subscribed,blocked,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const canWrite = session.appAccess.users === "write" && !session.viewAsRole;
  if (invitations.error || members.error)
    return (
      <section className="card card-body">
        <h1 className="page-title">Alumni Connect setup needed</h1>
        <p>
          Apply the Alumni Connect database migration before sending
          invitations. Existing members and mailing lists are unaffected.
        </p>
      </section>
    );
  return (
    <div className="grid gap-8 max-w-4xl">
      <header>
        <h1 className="page-title">Alumni Connect</h1>
        <p className="page-lede">
          Invite alumni to reconnect. They confirm their details and choose
          whether to join.
        </p>
        <Link className="text-brand underline" href="/users">
          Back to People
        </Link>
      </header>
      <section className="card card-body">
        <h2 className="card-title mb-5">Start a connection</h2>
        <InviteForm
          inviterName={session.profile.full_name}
          action={seedAlumniInvitations}
          disabled={!canWrite}
        />
      </section>
      <section className="grid gap-4">
        <h2 className="card-title">Recent invitations</h2>
        <p className="helper-text">
          Latest 100 invitations. Reserved or uncertain deliveries are never
          automatically resent.
        </p>
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
                  <td>{i.status}</td>
                  <td>{i.delivery}</td>
                  <td>
                    {canWrite && i.status === "pending" && (
                      <form action={revokeAlumniInvitation}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button type="submit" variant="secondary" compact>
                          Revoke invitation
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!invitations.data?.length && <p>No invitations yet.</p>}
      </section>
      <section className="grid gap-4">
        <h2 className="card-title">Recent subscribers</h2>
        <p className="helper-text">
          Latest 100 subscriptions. Manage profile details in People. Removing a
          subscription also blocks further referrals from that person.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => (
                <tr key={m.profile_id}>
                  <td>{m.email}</td>
                  <td>
                    {m.blocked
                      ? "Removed"
                      : m.subscribed
                        ? "Subscribed"
                        : "Unsubscribed"}
                  </td>
                  <td>
                    {canWrite && !m.blocked && (
                      <form action={removeAlumniSubscription}>
                        <input type="hidden" name="id" value={m.profile_id} />
                        <Button type="submit" variant="secondary" compact>
                          Remove subscription
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!members.data?.length && <p>No subscribers yet.</p>}
      </section>
    </div>
  );
}
