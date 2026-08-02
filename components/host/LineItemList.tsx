"use client";

import { useMemo } from "react";

export type LineItem = { description: string; amount: string };

const fmtUSD = (n: number) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Parse a line-item amount string. Empty/garbage → 0 (so the running total
 *  doesn't break while the user is mid-typing). */
function parseAmount(s: string): number {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function LineItemList({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const total = useMemo(
    () => items.reduce((acc, it) => acc + parseAmount(it.amount), 0),
    [items],
  );

  const setItem = (i: number, patch: Partial<LineItem>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const addItem = () => {
    onChange([...items, { description: "", amount: "" }]);
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_140px_28px] gap-x-3 pb-2 border-b border-rule">
        <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-muted">Description</div>
        <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-muted text-right">Amount (USD)</div>
        <div />
      </div>

      {items.length === 0 && (
        <div className="py-6 text-[12.5px] text-muted">
          No line items yet. Add one below.
        </div>
      )}

      <div className="divide-y divide-rule">
        {items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_140px_28px] gap-x-3 items-center py-2"
          >
            <input
              className="field-input"
              placeholder="e.g. Base rental — Fraternity House"
              value={item.description}
              onChange={e => setItem(i, { description: e.target.value })}
              autoComplete="off"
            />
            <input
              type="number"
              step="0.01"
              className="field-input text-right tabular-nums"
              placeholder="0.00"
              value={item.amount}
              onChange={e => setItem(i, { amount: e.target.value })}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              aria-label="Remove line item"
              className="h-8 w-7 inline-flex items-center justify-center text-muted hover:text-warn transition-colors"
            >
              <span className="text-[16px] leading-none">×</span>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 mt-2 border-t border-rule">
        <button
          type="button"
          onClick={addItem}
          className="text-[12px] font-bold tracking-[0.10em] uppercase text-brand hover:text-[#08456a] transition-colors"
        >
          + Add Line Item
        </button>
        <div className="flex items-baseline gap-3">
          <span className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-muted">Total</span>
          <span className="text-[18px] font-bold text-brand tabular-nums tracking-[-0.01em]">
            {fmtUSD(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
