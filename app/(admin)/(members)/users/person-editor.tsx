"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/brand/button";
import { updatePerson } from "@/app/(admin)/(members)/users/actions";
import { EXECUTIVE_ROLE_OPTIONS, MEMBERSHIP_OPTIONS, type ExecutiveRole } from "@/lib/people";
import type { AcademicYearOption, MemberRow } from "@/app/(admin)/(members)/users/members-table";

export function PersonEditor({ member, academicYears, canChangeAccount, onClose }: {
  member: MemberRow;
  academicYears: AcademicYearOption[];
  canChangeAccount: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [membership, setMembership] = useState(member.membership ?? "");
  const [offices, setOffices] = useState<ExecutiveRole[]>(member.executiveRoles);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const officesBlocked = membership !== "brother" && offices.length > 0;

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await updatePerson(member.id, formData).catch(() => ({
        error: "Unable to save this person. Please try again.",
      }));
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function toggleOffice(office: ExecutiveRole) {
    setOffices((current) => current.includes(office)
      ? current.filter((value) => value !== office)
      : [...current, office]);
  }

  return (
    <dialog ref={dialog} className="person-dialog" aria-labelledby="person-dialog-title" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); save(new FormData(event.currentTarget)); }}>
        <header className="person-dialog-header">
          <div className="min-w-0">
            <h2 className="card-title" id="person-dialog-title">{member.fullName || member.email}</h2>
            <p className="helper-text break-all">Signs in with {member.email}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <fieldset disabled={pending} className="person-dialog-section" aria-labelledby="person-roles-heading">
          <h3 className="person-dialog-heading" id="person-roles-heading">Roles</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="field-label" htmlFor="person-membership">Membership</label>
              <select className="field-input" id="person-membership" name="membership" value={membership} onChange={(event) => setMembership(event.target.value)}>
                <option value="">Not classified</option>
                {MEMBERSHIP_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="person-account">Account</label>
              <select className="field-input" id="person-account" name="role" defaultValue={member.role === "none" ? "member" : member.role} disabled={!canChangeAccount}>
                <option value="member">Base member</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="field-label">Offices</span>
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
              {EXECUTIVE_ROLE_OPTIONS.map(({ value, label }) => (
                <label className="person-office" key={value}>
                  <input className="h-4 w-4 accent-brand" type="checkbox" name="executiveRoles" value={value} checked={offices.includes(value)} disabled={membership !== "brother" && !offices.includes(value)} onChange={() => toggleOffice(value)} />
                  {label}
                </label>
              ))}
            </div>
            <p className="helper-text">Only brothers can hold an office. An office also gives the Executive member role.</p>
            {officesBlocked && <p className="form-message" role="alert">Remove all offices before you change membership.</p>}
          </div>
        </fieldset>

        <fieldset disabled={pending} className="person-dialog-section sm:grid-cols-2" aria-labelledby="person-details-heading">
          <h3 className="person-dialog-heading sm:col-span-2" id="person-details-heading">Details</h3>
          <div className="field">
            <label className="field-label" htmlFor="person-name">Name</label>
            <input className="field-input" id="person-name" name="fullName" defaultValue={member.fullName} maxLength={120} required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="person-term">Member since</label>
            <select className="field-input" id="person-term" name="memberSinceTermId" defaultValue={member.memberSinceTermId}>
              <option value="">Not set</option>
              {academicYears.map((year) => (
                <optgroup key={year.id} label={year.label}>
                  {year.terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="person-email">Contact email</label>
            <input className="field-input" id="person-email" name="contactEmail" type="email" defaultValue={member.contactEmail} maxLength={254} placeholder={member.email} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="person-phone">Phone</label>
            <input className="field-input" id="person-phone" name="phone" type="tel" defaultValue={member.phone} maxLength={50} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="person-discord">Discord ID</label>
            <input className="field-input" id="person-discord" name="discordUserId" defaultValue={member.discordUserId} inputMode="numeric" maxLength={25} pattern="(?:[0-9]{15,22}|<@!?[0-9]{15,22}>)" placeholder="ID or mention" title="Enter a 15–22 digit Discord user ID or paste a Discord mention" />
          </div>
        </fieldset>

        <footer className="person-dialog-footer">
          {error ? <p className="form-message mr-auto" role="alert">{error}</p> : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || officesBlocked}>{pending ? "Saving…" : "Save"}</Button>
        </footer>
      </form>
    </dialog>
  );
}
