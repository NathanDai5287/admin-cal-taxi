"use client";
import { Button } from "@/components/brand/button";

import Field from "./Field";
import LineItemList from "@/components/host/LineItemList";
import type { RentalFields } from "@/lib/host-documents";

export default function RentalPanel({
  fields,
  onChange,
  onReset,
  totalDescription,
  resets,
}: {
  fields: RentalFields;
  onChange: (patch: Partial<RentalFields>) => void;
  onReset: () => void;
  totalDescription: string;
  /** Per-field reset callbacks; a set callback means the field is pinned. */
  resets?: { dueDate?: () => void };
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Issue Date">
          <input
            type="date" className="field-input" required
            value={fields.issueDate}
            onChange={e => onChange({ issueDate: e.target.value })}
          />
        </Field>
        <Field label="Due Date" onResetAuto={resets?.dueDate}>
          <input
            type="date" className="field-input" required
            value={fields.dueDate}
            onChange={e => onChange({ dueDate: e.target.value })}
          />
        </Field>
      </div>

      <hr className="border-rule" />

      <div>
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <div>
            <div className="card-title">Line Items</div>
            <p className="text-[12px] text-muted mt-1.5 max-w-md">{totalDescription}</p>
          </div>
          <Button
            type="button"
            onClick={onReset}
            variant="text"
            title="Re-derive from current pricing selections and negotiated total"
          >
            Reset from Pricing
          </Button>
        </div>

        <LineItemList items={fields.items} onChange={items => onChange({ items })} />
      </div>
    </div>
  );
}
