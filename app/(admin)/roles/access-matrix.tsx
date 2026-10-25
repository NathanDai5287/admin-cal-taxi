"use client";

import { useState } from "react";
import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AccessLevel, type AppKey, type RoleAppAccess, type RoleKey, PARENT_ROLE } from "@/lib/app-access";
import { EXECUTIVE_ROLE_OPTIONS } from "@/lib/people";
import { ViewAsButton } from "@/components/view-as/view-as-bar";
import { setRoleAppAccess } from "./actions";

const ROLE_TREE_ORDER: RoleKey[] = ["admin", "member", "associate_member", "brother", "exec_member", ...EXECUTIVE_ROLE_OPTIONS.map(({ value }) => value)];

function roleLabel(role: RoleKey) {
  return ROLE_OPTIONS.find(({ key }) => key === role)!.label;
}

function roleDepth(role: RoleKey): number {
  const parent = PARENT_ROLE[role];
  return parent ? roleDepth(parent) + 1 : 0;
}

function ownAccess(permissions: RoleAppAccess[], role: RoleKey, app: AppKey): AccessLevel {
  return permissions.find((permission) => permission.role_key === role && permission.app_key === app)?.access_level ?? "none";
}

function inheritedAccess(permissions: RoleAppAccess[], role: RoleKey, app: AppKey): { access: AccessLevel; from?: RoleKey } {
  const parent = PARENT_ROLE[role];
  if (!parent) return { access: "none" };
  const fromAbove = inheritedAccess(permissions, parent, app);
  const parentOwn = ownAccess(permissions, parent, app);
  return ACCESS_LEVELS.indexOf(parentOwn) >= ACCESS_LEVELS.indexOf(fromAbove.access) && parentOwn !== "none"
    ? { access: parentOwn, from: parent }
    : fromAbove;
}

type AccessChange = (role: RoleKey, app: AppKey, access: AccessLevel) => Promise<string>;

function AccessSelect({ role, app, permissions, canWrite, onChange }: { role: RoleKey; app: AppKey; permissions: RoleAppAccess[]; canWrite: boolean; onChange: AccessChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const appLabel = APP_OPTIONS.find(({ key }) => key === app)?.label;
  const inherited = inheritedAccess(permissions, role, app);
  const minimumRank = ACCESS_LEVELS.indexOf(inherited.access);
  const access = ACCESS_LEVELS[Math.max(ACCESS_LEVELS.indexOf(ownAccess(permissions, role, app)), minimumRank)];

  async function changeAccess(value: AccessLevel) {
    setSaving(true);
    setError(await onChange(role, app, value));
    setSaving(false);
  }

  if (role === "admin") return <span className="role-access-fixed" data-access="write">Write</span>;
  return (
    <div className="role-access-control" aria-busy={saving} data-error={error ? "" : undefined} title={error || (inherited.from ? `${roleLabel(inherited.from)} gives ${inherited.access}` : undefined)}>
      <select aria-label={`${roleLabel(role)}: ${appLabel} access`} aria-invalid={Boolean(error)} className="field-input" data-access={access} data-inherited={inherited.from && access === inherited.access ? "" : undefined} disabled={!canWrite} value={access} onChange={(event) => changeAccess(event.target.value as AccessLevel)}>
        {ACCESS_LEVELS.slice(minimumRank).map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
      </select>
      {error && <span role="alert" className="sr-only">{error}</span>}
    </div>
  );
}

function RoleRow({ role, permissions, canWrite, onChange }: { role: RoleKey; permissions: RoleAppAccess[]; canWrite: boolean; onChange: AccessChange }) {
  return (
    <tr>
      <th scope="row" className="role-name" style={{ paddingLeft: `${0.75 + roleDepth(role) * 1.25}rem` }}>
        <span className="role-name-cell">{roleLabel(role)}{role !== "admin" && <ViewAsButton role={role} />}</span>
      </th>
      {APP_OPTIONS.map((app) => (
        <td key={app.key}>
          <AccessSelect role={role} app={app.key} permissions={permissions} canWrite={canWrite} onChange={onChange} />
        </td>
      ))}
    </tr>
  );
}

function withAccess(permissions: RoleAppAccess[], role: RoleKey, app: AppKey, access: AccessLevel) {
  return permissions.map((permission) => permission.role_key === role && permission.app_key === app ? { ...permission, access_level: access } : permission);
}

export function AccessMatrix({ permissions: savedPermissions, canWrite }: { permissions: RoleAppAccess[]; canWrite: boolean }) {
  const [permissions, setPermissions] = useState(savedPermissions);

  async function changeAccess(role: RoleKey, app: AppKey, access: AccessLevel) {
    const previous = ownAccess(permissions, role, app);
    setPermissions((current) => withAccess(current, role, app, access));
    const result = await setRoleAppAccess(role, app, access).catch(() => ({ error: "Unable to save access. Please try again." }));
    if (result.error) setPermissions((current) => withAccess(current, role, app, previous));
    return result.error ?? "";
  }

  return (
    <>
    <div className="roles-scroll" role="region" aria-label="Access by role and app" tabIndex={0}>
      <table className="data-table roles-matrix">
        <thead>
          <tr>
            <th scope="col" className="role-name">Role</th>
            {APP_OPTIONS.map((app) => <th scope="col" key={app.key}>{app.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROLE_TREE_ORDER.map((role) => <RoleRow key={role} role={role} permissions={permissions} canWrite={canWrite} onChange={changeAccess} />)}
        </tbody>
      </table>
    </div>
    </>
  );
}
