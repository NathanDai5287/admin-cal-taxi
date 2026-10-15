"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/brand/button";
import { updatePerson } from "@/app/(admin)/users/actions";
import { EXECUTIVE_ROLE_OPTIONS, type ExecutiveRole } from "@/lib/people";
import type { MemberRow } from "@/app/(admin)/users/members-table";

export function PersonEditor({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { nameInput.current?.focus(); }, []);
  const [membership, setMembership] = useState(member.membership ?? "");
  const [offices, setOffices] = useState<ExecutiveRole[]>(member.executiveRoles);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

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
    <form onSubmit={(event) => { event.preventDefault(); save(new FormData(event.currentTarget)); }} className="person-editor" aria-label={`Edit ${member.fullName || member.email}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="card-title">Edit person</h2>
          <p className="helper-text break-all">Sign-in email: {member.email}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
      </div>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label className="field-label" htmlFor="person-name">Name</label>
          <input ref={nameInput} className="field-input" id="person-name" name="fullName" defaultValue={member.fullName} maxLength={120} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="person-membership">Membership role</label>
          <select className="field-input" id="person-membership" name="membership" value={membership} onChange={(event) => setMembership(event.target.value)}>
            <option value="">Not classified</option>
            <option value="brother">Brother</option>
            <option value="associate_member">Associate member</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="person-email">Contact email</label>
          <input className="field-input" id="person-email" name="contactEmail" type="email" defaultValue={member.contactEmail} maxLength={254} />
          <p className="helper-text">Leave blank to use the sign-in email. This does not change sign-in access.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="person-phone">Phone</label>
          <input className="field-input" id="person-phone" name="phone" type="tel" defaultValue={member.phone} maxLength={50} />
        </div>
      </fieldset>
      <fieldset disabled={pending} className="grid gap-3">
        <legend className="field-label mb-3">Executive roles</legend>
        <p className="helper-text">Only brothers can hold executive roles. These also assign the Executive member role. Multiple people can be rush chair.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {EXECUTIVE_ROLE_OPTIONS.map(({ value, label }) => (
            <label className="person-office" key={value}>
              <input className="h-4 w-4 accent-brand" type="checkbox" name="executiveRoles" value={value} checked={offices.includes(value)} disabled={membership !== "brother" && !offices.includes(value)} onChange={() => toggleOffice(value)} />
              {label}
            </label>
          ))}
        </div>
        {membership !== "brother" && offices.length > 0 && <p className="form-message" role="alert">Remove all executive positions before changing membership.</p>}
      </fieldset>
      {error && <p className="form-message" role="alert">{error}</p>}
      <div><Button type="submit" variant="primary" disabled={pending || (membership !== "brother" && offices.length > 0)}>{pending ? "Saving…" : "Save person"}</Button></div>
    </form>
  );
}
