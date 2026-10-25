"use client";

import "./people.css";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { removeUser } from "@/app/(admin)/(members)/users/actions";
import { Button } from "@/components/brand/button";
import { PersonEditor } from "@/app/(admin)/(members)/users/person-editor";
import { EXECUTIVE_ROLE_OPTIONS, MEMBERSHIP_OPTIONS, type ExecutiveRole, type Membership } from "@/lib/people";
import { userLabel } from "@/lib/reimbursements/user-label";

export type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  contactEmail: string;
  phone: string;
  membership: Membership | null;
  executiveRoles: ExecutiveRole[];
  discordUserId: string;
  memberSinceTermId: string;
  role: "none" | "member" | "admin";
  hasSignedIn: boolean;
  statusLabel: string;
};

export type AcademicYearOption = {
  id: string;
  label: string;
  terms: Array<{ id: string; label: string }>;
};

function RoleBadges({ member }: { member: MemberRow }) {
  const membership = MEMBERSHIP_OPTIONS.find(({ value }) => value === member.membership)?.label;
  const offices = member.executiveRoles.map((office) => EXECUTIVE_ROLE_OPTIONS.find(({ value }) => value === office)?.label);
  return (
    <span className="people-roles">
      {member.role === "admin" && <span className="badge badge-verified">Administrator</span>}
      {membership ? <span className="badge">{membership}</span> : <span className="text-muted">Not classified</span>}
      {offices.map((office) => <span key={office} className="badge badge-approved">{office}</span>)}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

// Two-click remove, mirroring the sign-out pill: the first click arms the
// button (turns red, shows "?"), the second removes. Clicking away, pressing
// Escape, or waiting a few seconds disarms it.
function RemoveButton({ disabled, onRemove }: { disabled?: boolean; onRemove: () => void }) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 4000);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setArmed(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArmed(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [armed]);

  return (
    <button
      aria-label={armed ? "Click again to confirm removal" : "Remove user"}
      className={
        "inline-flex h-9 w-9 items-center justify-center border transition-colors duration-150 cursor-pointer " +
        (armed
          ? "bg-danger border-danger text-white text-xs font-bold"
          : "bg-surface border-rule text-muted hover:text-warn hover:border-warn") +
        (disabled ? " opacity-40 cursor-not-allowed" : "")
      }
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onRemove();
        } else {
          setArmed(true);
        }
      }}
      ref={rootRef}
      title={disabled ? "You can't remove yourself" : armed ? "Click again to confirm" : "Remove user"}
      type="button"
    >
      {armed ? "?" : <TrashIcon />}
    </button>
  );
}

export function MembersTable({
  members,
  currentUserId,
  academicYears,
  canWrite,
  canAssignAdmin,
}: {
  members: MemberRow[];
  currentUserId: string;
  academicYears: AcademicYearOption[];
  canWrite: boolean;
  canAssignAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingMember = members.find((member) => member.id === editingId);
  const [optimisticMembers, removeOptimistic] = useOptimistic(members, (current, userId: string) => current.filter((member) => member.id !== userId));
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const termLabels = new Map(academicYears.flatMap((year) => year.terms.map((term) => [term.id, term.label])));

  function remove(userId: string) {
    setError("");
    startTransition(async () => {
      removeOptimistic(userId);
      await removeUser(userId).catch(() => setError("Unable to remove that person. Please try again."));
    });
  }

  if (!optimisticMembers.length) {
    return <div className="empty-state border-t border-rule">No members yet.</div>;
  }

  return (
    <>
      {editingMember && <PersonEditor key={editingMember.id} member={editingMember} academicYears={academicYears} canChangeAccount={canAssignAdmin && editingMember.id !== currentUserId} onClose={() => setEditingId(null)} />}
      {error ? <p className="form-message px-6 pb-3" role="alert">{error}</p> : null}
      <div className="table-scroll people-table-scroll" role="region" aria-label="People and roles" tabIndex={0}>
      <table className="data-table people-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Roles</th>
            <th>Member since</th>
            <th>Discord</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {optimisticMembers.map((member) => {
            const isYou = member.id === currentUserId;
            return (
              <tr key={member.id}>
                <td className="people-identity">
                  <span className="people-name">{userLabel(member.fullName, member.email)}{isYou ? <span className="font-normal text-muted"> (you)</span> : null}</span>
                  <span className="people-contact">{member.contactEmail || member.email}{member.phone ? ` · ${member.phone}` : ""}</span>
                  {!member.hasSignedIn && <span className="people-status text-caution">{member.statusLabel}</span>}
                </td>
                <td data-label="Roles"><RoleBadges member={member} /></td>
                <td data-label="Member since" className="whitespace-nowrap">{termLabels.get(member.memberSinceTermId) ?? <span className="text-muted">Not set</span>}</td>
                <td data-label="Discord" className="whitespace-nowrap" title={member.discordUserId || undefined}>{member.discordUserId ? "Linked" : <span className="text-muted">Not linked</span>}</td>
                <td className="people-actions">
                  {canWrite && <Button compact variant="secondary" onClick={() => setEditingId(member.id)} aria-label={`Edit ${userLabel(member.fullName, member.email)}`}>Edit</Button>}
                  {canWrite && <RemoveButton disabled={isYou} onRemove={() => remove(member.id)} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
