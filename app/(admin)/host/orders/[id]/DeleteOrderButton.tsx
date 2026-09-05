"use client";

/** Delete, with a confirmation — there is no undo once minmus drops the row. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteOrderAction } from "../actions";

export default function DeleteOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      "Delete this order permanently? Its documents and pricing snapshot cannot be recovered.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await deleteOrderAction(orderId);
    if (result.ok) {
      router.push("/host/orders");
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <div className="flex items-center gap-2.5 ml-auto">
      {error && <span className="text-[11px] text-warn">{error}</span>}
      <button type="button" className="btn-link" disabled={busy} onClick={onDelete}>
        {busy ? "Deleting…" : "Delete Order"}
      </button>
    </div>
  );
}
