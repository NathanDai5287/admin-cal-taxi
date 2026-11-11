"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import type { ConnectResult } from "@/lib/alumni-connect/model";
export function AdminConnectAction({
  label,
  explanation,
  action,
}: {
  label: string;
  explanation: string;
  action: () => Promise<ConnectResult>;
}) {
  const [confirm, setConfirm] = useState(false),
    [result, setResult] = useState<ConnectResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <Button
        compact
        variant="secondary"
        disabled={pending}
        onClick={() => setConfirm(true)}
      >
        {label}
      </Button>
      {confirm && (
        <div className="grid gap-2">
          <p className="text-sm m-0">{explanation}</p>
          <div className="flex gap-2">
            <Button
              compact
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    const response = await action();
                    setResult(response);
                    if (response.ok) {
                      setConfirm(false);
                      router.refresh();
                    }
                  } catch {
                    setResult({
                      ok: false,
                      message:
                        "Nothing could be confirmed. Refresh and try again.",
                    });
                  }
                })
              }
            >
              Confirm
            </Button>
            <Button
              compact
              variant="text"
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} className="text-sm m-0">
          {result.message}
        </p>
      )}
    </div>
  );
}
