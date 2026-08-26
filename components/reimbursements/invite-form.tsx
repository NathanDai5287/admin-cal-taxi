"use client";

import { useActionState } from "react";

import { inviteMember, type InviteState } from "@/app/reimbursements/admin/actions";

const initialState: InviteState = { message: "", ok: false };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initialState);
  return (
    <form action={action} className="form-stack" style={{ marginTop: 0 }}>
      <div className="two-column-fields">
        <div className="field">
          <label htmlFor="invite-name">Member name</label>
          <input id="invite-name" name="fullName" required />
        </div>
        <div className="field">
          <label htmlFor="invite-email">Email</label>
          <input id="invite-email" name="email" type="email" required />
        </div>
      </div>
      {state.message && <p className={`form-message${state.ok ? " success" : ""}`}>{state.message}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Sending…" : "Invite member"}
      </button>
    </form>
  );
}
