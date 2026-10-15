"use client";

import { useState, useTransition } from "react";
import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AccessLevel, type AppKey, type RoleAppAccess, type RoleKey } from "@/lib/app-access";
import { setAppAccess, setRoleAppAccess } from "./actions";

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

  if (role === "admin") return <span className="role-access-fixed" data-access="write">Write</span>;
  return (
    <div className="role-access-control" aria-busy={pending}>
      <select aria-label={`${roleLabel}: ${appLabel} access`} className="field-input" data-access={access} disabled={!canWrite || pending} value={access} onChange={(event) => changeAccess(event.target.value as AccessLevel)}>
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
      <th scope="row" className="role-name">{role.label}</th>
      {APP_OPTIONS.map((app) => (
        <td key={app.key}>
          <AccessSelect role={role.key} app={app.key} canWrite={canWrite} access={permissions.find((permission) => permission.role_key === role.key && permission.app_key === app.key)?.access_level ?? "none"} />
        </td>
      ))}
    </tr>
  );
}

const ROLE_GROUPS = [
  { label: "Account", roles: ROLE_OPTIONS.filter(({ key }) => key === "admin" || key === "member") },
  { label: "Membership", roles: ROLE_OPTIONS.filter(({ key }) => key === "brother" || key === "associate_member") },
  { label: "Executive", roles: ROLE_OPTIONS.filter(({ key }) => key !== "admin" && key !== "member" && key !== "brother" && key !== "associate_member") },
];

function BulkAccess({ canWrite, pending, startTransition }: { canWrite: boolean; pending: boolean; startTransition: React.TransitionStartFunction }) {
  const [app, setApp] = useState<AppKey>(APP_OPTIONS[0].key);
  const [access, setAccess] = useState<AccessLevel>("read");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const appLabel = APP_OPTIONS.find(({ key }) => key === app)!.label;

  function applyAccess(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    startTransition(async () => {
      const result = await setAppAccess(app, access).catch(() => ({ error: "Unable to save access. Please try again." }));
      setError(result.error ?? "");
      if (!result.error) setSaved(`${appLabel}: all nonadministrator roles now have ${access} access.`);
    });
  }

  return (
    <form className="roles-bulk" onSubmit={applyAccess} aria-busy={pending}>
      <div className="roles-bulk-heading">
        <h2>Set access for everyone</h2>
        <p className="helper-text">Replaces all role settings for this app. Signed-in users only; administrators keep Write.</p>
      </div>
      <fieldset className="roles-bulk-fields" disabled={!canWrite || pending}>
        <label className="roles-bulk-app"><span className="field-label">App</span><select className="field-input" value={app} onChange={(event) => setApp(event.target.value as AppKey)}>{APP_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        <label><span className="field-label">Access</span><select className="field-input" value={access} onChange={(event) => setAccess(event.target.value as AccessLevel)}>{ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}</select></label>
        <button className="btn btn-primary" type="submit">{pending ? `Saving ${appLabel}…` : `Set all roles for ${appLabel}`}</button>
      </fieldset>
      {error && <p role="alert" className="form-message">{error}</p>}
      <p role="status" className="helper-text">{saved}</p>
    </form>
  );
}

export function AccessMatrix({ permissions, canWrite }: { permissions: RoleAppAccess[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <>
    <BulkAccess canWrite={canWrite} pending={pending} startTransition={startTransition} />
    <div className="table-scroll roles-scroll" role="region" aria-label="Access by role and app" tabIndex={0}>
      <table className="data-table roles-matrix">
        <thead>
          <tr>
            <th scope="col" className="role-name">Role</th>
            {APP_OPTIONS.map((app) => <th scope="col" key={app.key}>{app.label}</th>)}
          </tr>
        </thead>
        {ROLE_GROUPS.map((group) => (
          <tbody key={group.label}>
            <tr className="roles-group"><th scope="rowgroup" colSpan={APP_OPTIONS.length + 1}><span>{group.label}</span></th></tr>
            {group.roles.map((role) => <RoleRow key={role.key} role={role} permissions={permissions} canWrite={canWrite && !pending} />)}
          </tbody>
        ))}
      </table>
    </div>
    </>
  );
}
