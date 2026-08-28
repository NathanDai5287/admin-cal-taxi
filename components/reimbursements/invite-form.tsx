"use client";

import { useActionState } from "react";

import { inviteAdmin, inviteMember, type InviteState } from "@/app/reimbursements/admin/actions";

const initialState: InviteState = { message: "", ok: false };

export function InviteForm({ role }: { role: "member" | "admin" }) {
  const inviteAction = role === "admin" ? inviteAdmin : inviteMember;
  const [state, action, pending] = useActionState(inviteAction, initialState);
  const title = role === "admin" ? "Admin" : "Member";

  return (
    <form action={action} className="form-stack" style={{ marginTop: 0 }}>
      <div className="two-column-fields">
        <div className="field">
          <label htmlFor={`invite-${role}-name`}>{title} name</label>
          <input id={`invite-${role}-name`} name="fullName" required />
        </div>
        <div className="field">
          <label htmlFor={`invite-${role}-email`}>Email</label>
          <input id={`invite-${role}-email`} name="email" type="email" required />
        </div>
      </div>
      {state.message && <p className={`form-message${state.ok ? " success" : ""}`}>{state.message}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Sending…" : `Invite ${role}`}
      </button>
    </form>
  );
}
