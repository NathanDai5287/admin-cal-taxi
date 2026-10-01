"use client";

import { useEffect, useState } from "react";

export default function CompletedContractCopy() {
  const [state, setState] = useState("Checking completed contract…");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) { queueMicrotask(() => setState("This link is incomplete.")); return; }
    fetch("/api/host/signing/completed-copy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }), cache: "no-store",
    }).then(async response => {
      if (!response.ok) { setState(await response.text()); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "completed-hosting-contract.pdf";
      anchor.click();
      setState("Your completed contract is downloading.");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }).catch(() => setState("The completed contract is temporarily unavailable. Please try again."));
  }, []);
  return <main className="mx-auto max-w-xl px-6 py-16">
    <h1 className="text-2xl font-semibold">Completed hosting contract</h1>
    <p className="mt-4 text-sm">{state}</p>
  </main>;
}
