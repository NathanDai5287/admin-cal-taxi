"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { removeUser, setUserRole, updateDiscordUserId, updatePendingUserName } from "@/app/(admin)/users/actions";
import { Button } from "@/components/brand/button";
import { userLabel } from "@/lib/reimbursements/user-label";

export type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  discordUserId: string;
  role: "none" | "member" | "admin";
  hasSignedIn: boolean;
  statusLabel: string;
};

type OptimisticUpdate =
  | { type: "role"; userId: string; role: MemberRow["role"] }
  | { type: "name"; userId: string; fullName: string }
  | { type: "discord"; userId: string; discordUserId: string }
  | { type: "remove"; userId: string };

function applyUpdate(members: MemberRow[], update: OptimisticUpdate): MemberRow[] {
  if (update.type === "remove") {
    return members.filter((member) => member.id !== update.userId);
  }
  if (update.type === "name") {
    return members.map((member) =>
      member.id === update.userId ? { ...member, fullName: update.fullName } : member,
    );
  }
  if (update.type === "discord") {
    return members.map((member) =>
      member.id === update.userId ? { ...member, discordUserId: update.discordUserId } : member,
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

function PendingMemberName({
  member,
  disabled,
  onSave,
}: {
  member: MemberRow;
  disabled: boolean;
  onSave: (fullName: string) => void;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const normalizedName = fullName.trim();
  const unchanged = normalizedName === member.fullName;

  return (
    <form
      className="flex min-w-56 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(normalizedName);
      }}
    >
      <input
        aria-label={`Name for ${userLabel(member.fullName, member.email)}`}
        className="field-input min-w-0"
        disabled={disabled}
        maxLength={120}
        onChange={(event) => setFullName(event.target.value)}
        placeholder="Enter name"
        required
        value={fullName}
      />
      <Button
        className="shrink-0"
        compact
        disabled={disabled || !normalizedName || unchanged}
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
        "inline-flex h-8 w-8 items-center justify-center border transition-colors duration-150 cursor-pointer " +
        (armed
          ? "bg-danger border-danger text-white text-[13px] font-bold"
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
}: {
  members: MemberRow[];
  currentUserId: string;
}) {
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

  function changeName(userId: string, fullName: string) {
    setErrors((current) => { const next = new Map(current); next.delete(userId); return next; });
    setMemberPending(userId, true);
    startTransition(async () => {
      applyOptimistic({ type: "name", userId, fullName });
      try {
        await updatePendingUserName(userId, fullName);
      } catch {
        setErrors((current) => new Map(current).set(userId, "Unable to update that name. Please try again."));
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
      <table className={"data-table" + (pending ? " opacity-80" : "")}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Discord ID</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {optimisticMembers.map((member) => {
            const isYou = member.id === currentUserId;
            const memberPending = pendingIds.has(member.id);
            return (
              <tr key={member.id}>
                <td>
                  {member.hasSignedIn
                    ? userLabel(member.fullName, member.email)
                    : <PendingMemberName
                        disabled={memberPending}
                        member={member}
                        onSave={(fullName) => changeName(member.id, fullName)}
                      />}
                  {isYou ? <span className="text-muted"> (you)</span> : null}
                </td>
                <td>{member.email}</td>
                <td>
                  <DiscordMemberId
                    disabled={memberPending}
                    member={member}
                    onSave={(discordUserId) => changeDiscordUserId(member.id, discordUserId)}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Role for ${userLabel(member.fullName, member.email)}`}
                    className="field-input"
                    disabled={isYou || memberPending}
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
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="whitespace-nowrap">
                  <span className={member.hasSignedIn ? "text-ok" : "text-caution"}>{member.statusLabel}</span>
                </td>
                <td>
                  <RemoveButton disabled={isYou || memberPending} onRemove={() => remove(member.id)} />
                  {errors.get(member.id) ? <span className="form-message ml-2" role="alert">{errors.get(member.id)}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
