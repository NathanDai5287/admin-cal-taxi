"use client";

import { useFormStatus } from "react-dom";

export function ReimbursedCheckbox({ reimbursed }: { reimbursed: boolean }) {
  const { pending } = useFormStatus();

  return (
    <input
      aria-label={reimbursed ? "Reimbursement paid" : "Mark reimbursement as paid"}
      className="reimbursed-checkbox"
      defaultChecked={reimbursed}
      disabled={pending}
      name="reimbursed"
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit();
      }}
      type="checkbox"
      value="true"
    />
  );
}
