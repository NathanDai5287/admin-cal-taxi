"use client";

import Field from "./Field";
import type { CreditMemoFields } from "@/lib/host-documents";

export default function CreditMemoPanel({
  fields,
  onChange,
  amountHint,
  resets,
}: {
  fields: CreditMemoFields;
  onChange: (patch: Partial<CreditMemoFields>) => void;
  amountHint?: string;
  /** Per-field reset callbacks; a set callback means the field is pinned. */
  resets?: { amount?: () => void };
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Refund Amount (USD)" hint={amountHint} onResetAuto={resets?.amount}>
        <input
          className="field-input" type="number" min={0} step="0.01" required
          placeholder="e.g. 100"
          value={fields.amount}
          onChange={e => onChange({ amount: e.target.value })}
        />
      </Field>
      <Field label="Issue Date">
        <input
          type="date" className="field-input" required
          value={fields.issueDate}
          onChange={e => onChange({ issueDate: e.target.value })}
        />
      </Field>
      <Field label="Refund Method">
        <input
          className="field-input"
          placeholder="e.g. Zelle to organization treasurer"
          value={fields.refundMethod}
          onChange={e => onChange({ refundMethod: e.target.value })}
        />
      </Field>
      <Field label="Refund Description" hint="Optional. Auto-generated when blank.">
        <textarea
          className="field-textarea"
          placeholder="auto: Refund of security deposit for the event on …"
          value={fields.refundDescription}
          onChange={e => onChange({ refundDescription: e.target.value })}
        />
      </Field>
    </div>
  );
}
