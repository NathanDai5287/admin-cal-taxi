"use client";

import Field from "./Field";
import type { CreditMemoFields } from "@/lib/host-documents";

export default function CreditMemoPanel({
  fields,
  onChange,
  amountHint,
  originalInvoiceHint,
}: {
  fields: CreditMemoFields;
  onChange: (patch: Partial<CreditMemoFields>) => void;
  amountHint?: string;
  originalInvoiceHint?: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Refund Amount (USD)" hint={amountHint}>
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
      <Field label="Original Deposit Invoice" hint={originalInvoiceHint}>
        <input
          className="field-input" required placeholder="e.g. DEP-2026-0315-PISIGM"
          value={fields.originalInvoice}
          onChange={e => onChange({ originalInvoice: e.target.value })}
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
      <Field label="Memo Number" hint="Optional. Leave blank to auto-generate.">
        <input
          className="field-input" placeholder="auto: CM-YYYY-MMDD-XXXXXX"
          value={fields.memoNumber}
          onChange={e => onChange({ memoNumber: e.target.value })}
        />
      </Field>
    </div>
  );
}
