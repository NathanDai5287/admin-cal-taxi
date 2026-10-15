"use client";

import { useState, useTransition } from "react";
import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AccessLevel, type AppKey, type RoleAppAccess, type RoleKey } from "@/lib/app-access";
import { setRoleAppAccess } from "./actions";

function AccessSelect({ role, app, access, canWrite }: { role: RoleKey; app: AppKey; access: AccessLevel; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const roleLabel = ROLE_OPTIONS.find(({ key }) => key === role)?.label;
  const appLabel = APP_OPTIONS.find(({ key }) => key === app)?.label;

  function changeAccess(value: AccessLevel) {
    setError("");
    startTransition(async () => {
      const result = await setRoleAppAccess(role, app, value).catch(() => ({ error: "Unable to save access. Please try again." }));
      setError(result.error ?? "");
    });
  }

  if (role === "admin") return <span className="text-muted">Write</span>;
  return (
    <div className="min-w-24">
      <select aria-label={`${roleLabel}: ${appLabel} access`} className="field-input" disabled={!canWrite || pending} value={access} onChange={(event) => changeAccess(event.target.value as AccessLevel)}>
        {ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
      </select>
      {pending && <span role="status" className="helper-text">Saving…</span>}
      {error && <p role="alert" className="form-message">{error}</p>}
    </div>
  );
}

function RoleRow({ role, permissions, canWrite }: { role: (typeof ROLE_OPTIONS)[number]; permissions: RoleAppAccess[]; canWrite: boolean }) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 bg-surface whitespace-nowrap">{role.label}</th>
      {APP_OPTIONS.map((app) => (
        <td key={app.key}>
          <AccessSelect role={role.key} app={app.key} canWrite={canWrite} access={permissions.find((permission) => permission.role_key === role.key && permission.app_key === app.key)?.access_level ?? "none"} />
        </td>
      ))}
    </tr>
  );
}

export function AccessMatrix({ permissions, canWrite }: { permissions: RoleAppAccess[]; canWrite: boolean }) {
  return (
    <div className="table-scroll" role="region" aria-label="Access by role and app" tabIndex={0}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface">Role</th>
            {APP_OPTIONS.map((app) => <th scope="col" key={app.key} className="whitespace-nowrap">{app.label}</th>)}
          </tr>
        </thead>
        <tbody>{ROLE_OPTIONS.map((role) => <RoleRow key={role.key} role={role} permissions={permissions} canWrite={canWrite} />)}</tbody>
      </table>
    </div>
  );
}
