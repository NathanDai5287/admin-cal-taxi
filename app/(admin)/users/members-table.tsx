"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { removeUser, setUserRole } from "@/app/(admin)/users/actions";

export type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  role: "none" | "member" | "admin";
  joinedLabel: string;
};

type OptimisticUpdate =
  | { type: "role"; userId: string; role: MemberRow["role"] }
  | { type: "remove"; userId: string };

function applyUpdate(members: MemberRow[], update: OptimisticUpdate): MemberRow[] {
  if (update.type === "remove") {
    return members.filter((member) => member.id !== update.userId);
  }
  return members.map((member) =>
    member.id === update.userId ? { ...member, role: update.role } : member,
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
  const [error, setError] = useState<string | null>(null);

  function changeRole(userId: string, role: "member" | "admin") {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "role", userId, role });
      try {
        await setUserRole(userId, role);
      } catch {
        setError("Unable to update that role. Please try again.");
      }
    });
  }

  function remove(userId: string) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", userId });
      try {
        await removeUser(userId);
      } catch {
        setError("Unable to remove that user. Please try again.");
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
            <th>Role</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {optimisticMembers.map((member) => {
            const isYou = member.id === currentUserId;
            return (
              <tr key={member.id}>
                <td>
                  {member.fullName.trim() ? member.fullName : <span className="text-muted">—</span>}
                  {isYou ? <span className="text-muted"> (you)</span> : null}
                </td>
                <td>{member.email}</td>
                <td>
                  <select
                    aria-label={`Role for ${member.email}`}
                    className="field-input"
                    disabled={isYou}
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
                <td className="whitespace-nowrap">{member.joinedLabel}</td>
                <td>
                  <RemoveButton disabled={isYou} onRemove={() => remove(member.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p className="form-message px-6 pb-5">{error}</p> : null}
    </>
  );
}
