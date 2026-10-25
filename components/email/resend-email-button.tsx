"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resendEmail } from "@/app/(admin)/email-actions";
import { Button } from "@/components/brand/button";

export function ResendEmailButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function send() {
    setError("");
    startTransition(async () => {
      const result = await resendEmail(messageId);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  return <>
    <Button compact disabled={pending} onClick={send} variant="secondary">{pending ? "Sending…" : "Send again"}</Button>
    {error && <p className="form-message" role="alert">{error}</p>}
  </>;
}
