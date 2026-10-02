"use client";

/**
 * The status override control on an order's header. `null` ("Auto") defers
 * to `deriveStatus` (see lib/host-orders-types.ts); any other value pins the
 * order regardless of which documents exist — the only way an order becomes
 * "cancelled".
 */

import { useState } from "react";
import { setOrderStatusAction } from "../actions";
import { STATUS_LABELS, type OrderStatus } from "@/lib/host-orders-types";

const OPTIONS: { value: OrderStatus | ""; label: string }[] = [
  { value: "",            label: "From generated documents" },
  { value: "draft",       label: STATUS_LABELS.draft },
  { value: "contracted",  label: STATUS_LABELS.contracted },
  { value: "invoiced",    label: STATUS_LABELS.invoiced },
  { value: "completed",   label: STATUS_LABELS.completed },
];

export default function StatusControl({
  orderId,
  current,
}: {
  orderId: string;
  current: OrderStatus | null;
}) {
  const [value, setValue] = useState<OrderStatus | "">(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onChange(next: OrderStatus | "") {
    const prev = value;
    setValue(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await setOrderStatusAction(orderId, next === "" ? null : next);
    setBusy(false);
    if (result.ok) {
      setSaved(true);
    } else {
      setError(result.error);
      setValue(prev);
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      <label className="field-label mb-0 whitespace-nowrap" htmlFor="status-override">
        Order label
      </label>
      <select
        id="status-override"
        className="field-input !w-auto"
        value={value}
        disabled={busy}
        onChange={e => onChange(e.target.value as OrderStatus | "")}
      >
        {value === "cancelled" ? <option value="cancelled">Cancelled (legacy)</option> : null}
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {busy && <span className="text-[11px] text-muted whitespace-nowrap">Saving…</span>}
      {!busy && saved && <span className="text-[11px] text-ok whitespace-nowrap">Saved</span>}
      {!busy && error && <span className="text-[11px] text-warn">{error}</span>}
    </div>
  );
}
