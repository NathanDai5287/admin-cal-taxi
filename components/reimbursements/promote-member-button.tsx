"use client";

import { useFormStatus } from "react-dom";

export function PromoteMemberButton({ memberName }: { memberName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="button button-secondary button-compact"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(`Make ${memberName} an admin? They will be able to manage members and reimbursements.`)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      {pending ? "Promoting…" : "Make admin"}
    </button>
  );
}
