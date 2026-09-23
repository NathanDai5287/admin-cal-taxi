"use client";

import Field from "./Field";
import type { DepositFields } from "@/lib/host-documents";

export default function DepositPanel({
  fields,
  onChange,
  amountHint,
  resets,
}: {
  fields: DepositFields;
  onChange: (patch: Partial<DepositFields>) => void;
  amountHint?: string;
  /** Per-field reset callbacks; a set callback means the field is pinned. */
  resets?: { amount?: () => void; dueDate?: () => void };
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Deposit Amount (USD)" hint={amountHint} onResetAuto={resets?.amount}>
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
      <Field label="Due Before" onResetAuto={resets?.dueDate}>
        <input
          type="date" className="field-input" required
          value={fields.dueDate}
          onChange={e => onChange({ dueDate: e.target.value })}
        />
      </Field>
      <Field label="Invoice Number" hint="Optional. Leave blank to auto-generate.">
        <input
          className="field-input" placeholder="auto: DEP-YYYY-MMDD-XXXXXX"
          value={fields.invoiceNumber}
          onChange={e => onChange({ invoiceNumber: e.target.value })}
        />
      </Field>
    </div>
  );
}
