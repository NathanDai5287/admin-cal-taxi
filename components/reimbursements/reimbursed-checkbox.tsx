"use client";

export function ReimbursedCheckbox({
  disabled = false,
  onChange,
  reimbursed,
}: {
  disabled?: boolean;
  onChange: (reimbursed: boolean) => void;
  reimbursed: boolean;
}) {
  return (
    <input
      aria-label={reimbursed ? "Reimbursement paid" : "Mark reimbursement as paid"}
      checked={reimbursed}
      className="checkbox-brand"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)}
      type="checkbox"
    />
  );
}
