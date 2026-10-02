"use client";
import { Button } from "@/components/brand/button";

/** Remove the order; the backend retires links and retains signing records. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteOrderAction } from "../actions";
import { retireOrderDrafts } from "@/lib/host-draft-storage";

export default function DeleteOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      "Delete this order? Its pricing snapshot and unsigned document entries will no longer be available. Outstanding signing links will be cancelled. Contract signing records and their stored PDFs will be retained.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await deleteOrderAction(orderId);
    if (result.ok) {
      retireOrderDrafts(orderId);
      router.push("/host/orders");
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <div className="flex items-center gap-2.5 ml-auto">
      {error && <span className="text-[11px] text-warn">{error}</span>}
      <Button type="button" variant="text" disabled={busy} onClick={onDelete}>
        {busy ? "Deleting…" : "Delete Order"}
      </Button>
    </div>
  );
}
