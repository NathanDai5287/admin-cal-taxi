"use client";

import { useOptimistic, useTransition } from "react";
import { ROLE_OPTIONS, roleWithAncestors, type RoleKey } from "@/lib/app-access";
import { startViewAs, stopViewAs } from "./actions";

const VIEWABLE_ROLES = ROLE_OPTIONS.filter(({ key }) => key !== "admin");

function roleLabel(role: RoleKey) {
  return ROLE_OPTIONS.find(({ key }) => key === role)!.label;
}

function LoadingProgress() {
  return <span className="view-as-progress" aria-hidden="true" />;
}

export function ViewAsBar({ role }: { role: RoleKey }) {
  const [pending, startTransition] = useTransition();
  const [shownRole, showRole] = useOptimistic(role);
  const includedRoles = roleWithAncestors(shownRole).slice(1).map(roleLabel).join(", ");

  function switchRole(nextRole: RoleKey) {
    startTransition(async () => {
      showRole(nextRole);
      await startViewAs(nextRole, false);
    });
  }

  return (
    <div className="view-as-bar" role="status" aria-busy={pending}>
      {pending && <LoadingProgress />}
      <span>
        {pending ? <span className="view-as-spinner" aria-hidden="true" /> : null}
        {pending ? "Loading as " : "Viewing as "}
        <select aria-label="Role to view as" value={shownRole} disabled={pending} onChange={(event) => switchRole(event.target.value as RoleKey)}>
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
    <>
      {pending && <LoadingProgress />}
      <button type="button" className="view-as-button" data-pending={pending || undefined} disabled={pending} title={`View the app as ${roleLabel(role)}`} onClick={() => startTransition(() => startViewAs(role, true))}>
        {pending ? <><span className="view-as-spinner" aria-hidden="true" />Opening…</> : "View as"}
      </button>
    </>
  );
}
