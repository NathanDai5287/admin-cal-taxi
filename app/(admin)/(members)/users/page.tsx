import { Button } from "@/components/brand/button";
import type { Metadata } from "next";

import { inviteUser } from "@/app/(admin)/(members)/users/actions";
import { MembersTable, type AcademicYearOption } from "@/app/(admin)/(members)/users/members-table";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const metadata: Metadata = { title: "People · Members" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function UsersPage() {
  const [session, supabase] = await Promise.all([requireAppAccess("users"), createClient()]);
  const [profilesResult, yearsResult, termsResult] = await Promise.all([
    loadAllPages((from, to) => supabase
      .from("profiles")
      .select("id, full_name, email, contact_email, phone, membership, executive_roles, role, has_signed_in, discord_user_id, member_since_term_id, created_at")
      .is("removed_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    supabase.from("academic_years").select("id, label, starts_on").order("starts_on", { ascending: false }),
    supabase.from("academic_terms").select("id, cycle_id, label, starts_on, ends_on").order("starts_on", { ascending: true }),
  ]);

  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }
  if (yearsResult.error || termsResult.error) {
    throw new Error(`Unable to load the academic calendar: ${yearsResult.error?.message ?? termsResult.error?.message}`);
  }
  const canWrite = session.appAccess.users === "write";
  const profiles = profilesResult.data ?? [];
  const terms = termsResult.data ?? [];
  const academicYears: AcademicYearOption[] = (yearsResult.data ?? []).map((year) => ({
    id: year.id,
    label: year.label,
    terms: terms
      .filter((term) => term.cycle_id === year.id)
      .map((term) => ({ id: term.id, label: term.label })),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const defaultAcademicTermId = terms.find((term) => term.starts_on <= today && term.ends_on >= today)?.id
    ?? [...terms].reverse().find((term) => term.starts_on <= today)?.id
    ?? "";

  return (
    <div className="grid min-w-0 gap-6">
      <h1 className="page-title">People</h1>

      {canWrite && <section className="card" aria-labelledby="invite-user-title">
        <div className="card-header">
          <h2 className="card-title" id="invite-user-title">Invite people</h2>
        </div>
        <form action={inviteUser} className="card-body border-t border-rule pt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end">
          <div className="field">
            <label className="field-label" htmlFor="email">Email addresses</label>
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="field-input"
              id="email"
              multiple
              name="email"
              placeholder="alex@example.com, jordan@example.com"
              required
              spellCheck={false}
              type="email"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="memberSinceTermId">Member since</label>
            <select className="field-input min-w-40" defaultValue={defaultAcademicTermId} id="memberSinceTermId" name="memberSinceTermId">
              <option value="">Not set</option>
              {academicYears.map((year) => (
                <optgroup key={year.id} label={year.label}>
                  {year.terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="role">Account</label>
            <select className="field-input" defaultValue="member" id="role" name="role">
              <option value="member">Base member</option>
              {session.profile.role === "admin" && <option value="admin">Administrator</option>}
            </select>
          </div>
          <Button variant="primary" type="submit">Invite</Button>
        </form>
        <p className="helper-text px-6 pb-5">
          Separate email addresses with commas. New people show in the list at once, so you can set their roles before they sign in.
        </p>
      </section>}

      <section className="card min-w-0" aria-labelledby="members-title">
        <div className="card-header">
          <h2 className="card-title" id="members-title">People <span className="ml-2 text-muted tabular-nums">{profiles.length}</span></h2>
        </div>
        {!canWrite && <p className="helper-text px-6 pb-4">You have read access. You cannot change people or their roles.</p>}
        <MembersTable
          canWrite={canWrite}
          canAssignAdmin={session.profile.role === "admin"}
          academicYears={academicYears}
          currentUserId={session.userId}
          members={profiles.map((profile) => ({
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            contactEmail: profile.contact_email,
            phone: profile.phone,
            membership: profile.membership,
            executiveRoles: profile.executive_roles,
            discordUserId: profile.discord_user_id,
            memberSinceTermId: profile.member_since_term_id ?? "",
            role: profile.role,
            hasSignedIn: profile.has_signed_in,
            statusLabel: `Invited ${formatDate(profile.created_at)}`,
          }))}
        />
      </section>
    </div>
  );
}
