"use client";

import "./people.css";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { removeUser, setUserRole, updateDiscordUserId, updateMemberAcademicTerm } from "@/app/(admin)/(members)/users/actions";
import { Button } from "@/components/brand/button";
import { PersonEditor } from "@/app/(admin)/(members)/users/person-editor";
import { EXECUTIVE_ROLE_OPTIONS, type ExecutiveRole, type Membership } from "@/lib/people";
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

type OptimisticUpdate =
  | { type: "role"; userId: string; role: MemberRow["role"] }
  | { type: "discord"; userId: string; discordUserId: string }
  | { type: "academicTerm"; userId: string; memberSinceTermId: string }
  | { type: "remove"; userId: string };

function applyUpdate(members: MemberRow[], update: OptimisticUpdate): MemberRow[] {
  if (update.type === "remove") {
    return members.filter((member) => member.id !== update.userId);
  }
  if (update.type === "discord") {
    return members.map((member) =>
      member.id === update.userId ? { ...member, discordUserId: update.discordUserId } : member,
    );
  }
  if (update.type === "academicTerm") {
    return members.map((member) =>
      member.id === update.userId ? { ...member, memberSinceTermId: update.memberSinceTermId } : member,
    );
  }
  return members.map((member) =>
    member.id === update.userId ? { ...member, role: update.role } : member,
  );
}

function DiscordMemberId({
  member,
  disabled,
  onSave,
}: {
  member: MemberRow;
  disabled: boolean;
  onSave: (discordUserId: string) => void;
}) {
  const [discordUserId, setDiscordUserId] = useState(member.discordUserId);
  const normalizedId = discordUserId.trim().match(/^<@!?(\d{15,22})>$/)?.[1] ?? discordUserId.trim();
  const valid = !normalizedId || /^\d{15,22}$/.test(normalizedId);

  return (
    <form
      className="flex min-w-56 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setDiscordUserId(normalizedId);
        onSave(normalizedId);
      }}
    >
      <input
        aria-label={`Discord ID for ${userLabel(member.fullName, member.email)}`}
        className="field-input min-w-0"
        disabled={disabled}
        inputMode="numeric"
        maxLength={25}
        onChange={(event) => setDiscordUserId(event.target.value)}
        pattern="(?:[0-9]{15,22}|<@!?[0-9]{15,22}>)"
        placeholder="Optional ID or mention"
        title="Enter a 15–22 digit Discord user ID or paste a Discord mention"
        value={discordUserId}
      />
      <Button
        className="shrink-0"
        compact
        disabled={disabled || !valid || normalizedId === member.discordUserId}
        type="submit"
        variant="secondary"
      >
        Save
      </Button>
    </form>
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
        "inline-flex h-11 w-11 items-center justify-center border transition-colors duration-150 cursor-pointer " +
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
  const [optimisticMembers, applyOptimistic] = useOptimistic(members, applyUpdate);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  function setMemberPending(userId: string, value: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (value) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function changeRole(userId: string, role: "member" | "admin") {
    setErrors((current) => { const next = new Map(current); next.delete(userId); return next; });
    setMemberPending(userId, true);
    startTransition(async () => {
      applyOptimistic({ type: "role", userId, role });
      try {
        await setUserRole(userId, role);
      } catch {
        setErrors((current) => new Map(current).set(userId, "Unable to update that role. Please try again."));
      } finally {
        setMemberPending(userId, false);
      }
    });
  }

  function changeDiscordUserId(userId: string, discordUserId: string) {
    setErrors((current) => { const next = new Map(current); next.delete(userId); return next; });
    setMemberPending(userId, true);
    startTransition(async () => {
      applyOptimistic({ type: "discord", userId, discordUserId });
      try {
        await updateDiscordUserId(userId, discordUserId);
      } catch {
        setErrors((current) => new Map(current).set(userId, "Unable to update that Discord ID. Please try again."));
      } finally {
        setMemberPending(userId, false);
      }
    });
  }

  function changeAcademicTerm(userId: string, memberSinceTermId: string) {
    setErrors((current) => { const next = new Map(current); next.delete(userId); return next; });
    setMemberPending(userId, true);
    startTransition(async () => {
      applyOptimistic({ type: "academicTerm", userId, memberSinceTermId });
      try {
        await updateMemberAcademicTerm(userId, memberSinceTermId);
      } catch {
        setErrors((current) => new Map(current).set(userId, "Unable to update that academic term. Please try again."));
      } finally {
        setMemberPending(userId, false);
      }
    });
  }

  function remove(userId: string) {
    setErrors((current) => { const next = new Map(current); next.delete(userId); return next; });
    setMemberPending(userId, true);
    startTransition(async () => {
      applyOptimistic({ type: "remove", userId });
      try {
        await removeUser(userId);
      } catch {
        setErrors((current) => new Map(current).set(userId, "Unable to remove that user. Please try again."));
      } finally {
        setMemberPending(userId, false);
      }
    });
  }

  if (!optimisticMembers.length) {
    return <div className="empty-state border-t border-rule">No members yet.</div>;
  }

  return (
    <>
      {editingMember && <PersonEditor key={editingMember.id} member={editingMember} onClose={() => setEditingId(null)} />}
      <div className="table-scroll people-table-scroll" role="region" aria-label="Users and roles" tabIndex={0}>
      <table className={"data-table people-table" + (pending ? " opacity-80" : "")}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Membership</th>
            <th>Executive positions</th>
            <th>Discord ID</th>
            <th>Member since</th>
            <th>Account role</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {optimisticMembers.map((member) => {
            const isYou = member.id === currentUserId;
            const memberPending = pendingIds.has(member.id);
            return (
              <tr key={member.id}>
                <td className="people-identity">
                  <button type="button" disabled={!canWrite} className="people-name" onClick={() => setEditingId(member.id)}>
                    {userLabel(member.fullName, member.email)}
                  </button>
                  {isYou ? <span className="text-muted"> (you)</span> : null}
                  <span className="people-contact">{member.contactEmail || member.email}</span>
                  {member.phone && <span className="people-contact">{member.phone}</span>}
                  <span className={member.hasSignedIn ? "people-status text-ok" : "people-status text-caution"}>{member.statusLabel}</span>
                </td>
                <td data-label="Membership" className="whitespace-nowrap">{member.membership === "brother" ? "Brother" : member.membership === "associate_member" ? "Associate member" : "Not classified"}</td>
                <td data-label="Executive positions">
                  {member.executiveRoles.length > 0 && <span className="block text-xs text-muted">Executive member</span>}
                  {member.executiveRoles.map((office) => EXECUTIVE_ROLE_OPTIONS.find((option) => option.value === office)?.label).join(", ") || "None"}
                </td>
                <td data-label="Discord ID">
                  <DiscordMemberId
                    disabled={!canWrite || memberPending}
                    member={member}
                    onSave={(discordUserId) => changeDiscordUserId(member.id, discordUserId)}
                  />
                </td>
                <td data-label="Member since">
                  <select
                    aria-label={`Academic term for ${userLabel(member.fullName, member.email)}`}
                    className="field-input min-w-40"
                    disabled={!canWrite || memberPending || !academicYears.length}
                    onChange={(event) => changeAcademicTerm(member.id, event.target.value)}
                    value={member.memberSinceTermId}
                  >
                    <option value="">Not set</option>
                    {academicYears.map((year) => (
                      <optgroup key={year.id} label={year.label}>
                        {year.terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td data-label="Account role">
                  <select
                    aria-label={`Account role for ${userLabel(member.fullName, member.email)}`}
                    className="field-input"
                    disabled={!canWrite || !canAssignAdmin || isYou || memberPending}
                    onChange={(event) => changeRole(member.id, event.target.value as "member" | "admin")}
                    title={isYou ? "You can't change your own role" : undefined}
                    value={member.role}
                  >
                    {/* 'none' is not a selectable option — removing access is
                        done with the remove button. Shown only so members who
                        currently have no access display accurately. */}
                    {member.role === "none" ? (
                      <option disabled hidden value="none">
                        No access
                      </option>
                    ) : null}
                    <option value="member">Base member</option>
                    <option value="admin">Administrator</option>
                  </select>
                </td>
                <td data-label="Remove user">
                  <RemoveButton disabled={!canWrite || isYou || memberPending} onRemove={() => remove(member.id)} />
                  {errors.get(member.id) ? <span className="form-message ml-2" role="alert">{errors.get(member.id)}</span> : null}
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
