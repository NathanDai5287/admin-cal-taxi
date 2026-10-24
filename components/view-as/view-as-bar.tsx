"use client";

import { useTransition } from "react";
import { ROLE_OPTIONS, roleWithAncestors, type RoleKey } from "@/lib/app-access";
import { startViewAs, stopViewAs } from "./actions";

const VIEWABLE_ROLES = ROLE_OPTIONS.filter(({ key }) => key !== "admin");

function roleLabel(role: RoleKey) {
  return ROLE_OPTIONS.find(({ key }) => key === role)!.label;
}

export function ViewAsBar({ role }: { role: RoleKey }) {
  const [pending, startTransition] = useTransition();
  const includedRoles = roleWithAncestors(role).slice(1).map(roleLabel).join(", ");

  return (
    <div className="view-as-bar" role="status" aria-busy={pending}>
      <span>
        Viewing as{" "}
        <select aria-label="Role to view as" value={role} disabled={pending} onChange={(event) => startTransition(() => startViewAs(event.target.value))}>
          {VIEWABLE_ROLES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
        {includedRoles && <span className="view-as-includes"> · includes {includedRoles}</span>}
        <span className="view-as-includes"> · changes are blocked</span>
      </span>
      <button type="button" disabled={pending} onClick={() => startTransition(() => stopViewAs())}>Exit</button>
    </div>
  );
}

export function ViewAsButton({ role }: { role: RoleKey }) {
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="view-as-button" disabled={pending} title={`View the app as ${roleLabel(role)}`} onClick={() => startTransition(() => startViewAs(role))}>
      {pending ? "Opening…" : "View as"}
    </button>
  );
}
