"use client";

import { useEffect, useState, useTransition } from "react";

import { banPairAction, unbanPairAction } from "./actions";
import { Button } from "@/components/brand/button";

export function RushAccessControl({ banned: initialBanned, deviceId, ip }: {
  banned: boolean;
  deviceId: string;
  ip: string;
}) {
  const [banned, setBanned] = useState(initialBanned);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (pending) return;
    const timer = window.setTimeout(() => setBanned(initialBanned), 0);
    return () => window.clearTimeout(timer);
  }, [initialBanned, pending]);

  function toggle() {
    const previous = banned;
    const next = !previous;
    setBanned(next);
    setError("");
    const form = new FormData();
    form.set("ip", ip);
    form.set("deviceId", deviceId);
    startTransition(async () => {
      try {
        await (next ? banPairAction : unbanPairAction)(form);
      } catch {
        setBanned(previous);
        setError("Could not update access.");
      }
    });
  }

  return (
    <>
      <td className="px-4 py-2">
        <span aria-live="polite" className={`rounded-full px-2 py-0.5 text-xs font-semibold ${banned ? "bg-warn-light text-warn" : "bg-ok-light text-ok"}`}>
          {banned ? "banned" : "active"}
        </span>
      </td>
      <td className="px-4 py-2">
        <Button compact disabled={pending} onClick={toggle} variant={banned ? "secondary" : "danger"}>
          {banned ? "Unban" : "Ban"}
        </Button>
        {error ? <span className="form-message ml-2" role="alert">{error}</span> : null}
      </td>
    </>
  );
}
