import { Button } from "@/components/brand/button";
import type { Metadata } from "next";

import { inviteUser } from "@/app/(admin)/users/actions";
import { MembersTable, type AcademicYearOption } from "@/app/(admin)/users/members-table";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function UsersPage() {
  const [session, supabase] = await Promise.all([getSessionProfile(), createClient()]);
  const [profilesResult, yearsResult, termsResult] = await Promise.all([
    loadAllPages((from, to) => supabase
      .from("profiles")
      .select("id, full_name, email, role, has_signed_in, discord_user_id, member_since_term_id, created_at")
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
    <div className="grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter admin</p>
        <h1 className="page-title">Members</h1>
        <p className="page-lede">Invite people, record when they joined, and manage who can access the chapter apps.</p>
      </div>

      <section className="card" aria-labelledby="invite-user-title">
        <div className="card-header">
          <span className="card-title" id="invite-user-title">Invite people</span>
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
            <label className="field-label" htmlFor="role">Role</label>
            <select className="field-input" defaultValue="member" id="role" name="role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button variant="primary" type="submit">Invite</Button>
        </form>
        <p className="helper-text px-6 pb-5">
          Separate multiple email addresses with commas. Each person appears as a
          member immediately, so you can assign dues before their first Google sign-in.
          When email delivery is configured, they also receive sign-in instructions.
        </p>
      </section>

      <section className="card table-scroll" aria-labelledby="members-title">
        <div className="card-header">
          <span className="card-title" id="members-title">Members</span>
        </div>
        <MembersTable
          academicYears={academicYears}
          currentUserId={session?.userId ?? ""}
          members={profiles.map((profile) => ({
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            discordUserId: profile.discord_user_id,
            memberSinceTermId: profile.member_since_term_id ?? "",
            role: profile.role,
            hasSignedIn: profile.has_signed_in,
            statusLabel: profile.has_signed_in ? "Signed in" : `Invited ${formatDate(profile.created_at)}`,
          }))}
        />
        <p className="helper-text px-6 pb-5">
          Academic terms come from the shared calendar used by Accreditation and Finance.
          Removing someone revokes their invitation or access while preserving their history.
        </p>
      </section>
    </div>
  );
}
