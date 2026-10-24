"use client";

import { useState, useTransition } from "react";
import { ACCESS_LEVELS, APP_OPTIONS, ROLE_OPTIONS, type AccessLevel, type AppKey, type RoleAppAccess, type RoleKey } from "@/lib/app-access";
import { EXECUTIVE_ROLE_OPTIONS } from "@/lib/people";
import { setAppAccess, setRoleAppAccess } from "./actions";

const PARENT_ROLE: Partial<Record<RoleKey, RoleKey>> = {
  brother: "member",
  associate_member: "member",
  exec_member: "brother",
  ...Object.fromEntries(EXECUTIVE_ROLE_OPTIONS.map(({ value }) => [value, "exec_member"])),
};
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

function AccessSelect({ role, app, permissions, canWrite }: { role: RoleKey; app: AppKey; permissions: RoleAppAccess[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const appLabel = APP_OPTIONS.find(({ key }) => key === app)?.label;
  const inherited = inheritedAccess(permissions, role, app);
  const minimumRank = ACCESS_LEVELS.indexOf(inherited.access);
  const access = ACCESS_LEVELS[Math.max(ACCESS_LEVELS.indexOf(ownAccess(permissions, role, app)), minimumRank)];

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
      <select aria-label={`${roleLabel(role)}: ${appLabel} access`} className="field-input" data-access={access} disabled={!canWrite || pending} value={access} onChange={(event) => changeAccess(event.target.value as AccessLevel)}>
        {ACCESS_LEVELS.slice(minimumRank).map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
      </select>
      {inherited.from && <span className="helper-text role-access-inherited">From {roleLabel(inherited.from)}</span>}
      {pending && <span role="status" className="helper-text">Saving…</span>}
      {error && <p role="alert" className="form-message">{error}</p>}
    </div>
  );
}

function RoleRow({ role, permissions, canWrite }: { role: RoleKey; permissions: RoleAppAccess[]; canWrite: boolean }) {
  return (
    <tr>
      <th scope="row" className="role-name" style={{ paddingLeft: `${0.75 + roleDepth(role) * 1.25}rem` }}>
        {PARENT_ROLE[role] && <span aria-hidden className="role-tree-branch">└ </span>}{roleLabel(role)}
      </th>
      {APP_OPTIONS.map((app) => (
        <td key={app.key}>
          <AccessSelect role={role} app={app.key} permissions={permissions} canWrite={canWrite} />
        </td>
      ))}
    </tr>
  );
}

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
        <tbody>
          {ROLE_TREE_ORDER.map((role) => <RoleRow key={role} role={role} permissions={permissions} canWrite={canWrite && !pending} />)}
        </tbody>
      </table>
    </div>
    </>
  );
}
