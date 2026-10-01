"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/brand/button";
import type { SigningRevision } from "@/lib/host-signing";
import { createSigningLinksAction, listSigningAction, reconcileSigningAction, syncSigningAction } from "../../documents/signing-actions";

export default function OrderSigning({ orderId, onLatest }: {
  orderId: string;
  onLatest?: (revision: SigningRevision | null) => void;
}) {
  const [rows, setRows] = useState<SigningRevision[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    listSigningAction(orderId).then(async found => {
      if (found[0]?.state === "awaiting_signatures" || found[0]?.state === "preparing_completed_copy") {
        found[0] = await syncSigningAction(orderId, found[0].id).catch(() => found[0]);
      }
      if (alive) { setRows(found); onLatest?.(found[0] ?? null); }
    }).catch(err => { if (alive) setError(err instanceof Error ? err.message : "Could not load signing status"); });
    return () => { alive = false; };
  }, [orderId, onLatest]);

  async function refresh(row: SigningRevision) {
    setBusy(true);
    try {
      const next = await syncSigningAction(orderId, row.id);
      setRows(previous => previous.map(r => r.id === next.id ? next : r));
      if (rows[0]?.id === next.id) onLatest?.(next);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not refresh signing status"); }
    finally { setBusy(false); }
  }

  async function recover(row: SigningRevision) {
    setBusy(true); setError("");
    try {
      const next = row.state === "created"
        ? await createSigningLinksAction(orderId, row.id, row.original_sha256)
        : await reconcileSigningAction(orderId, row.id);
      setRows(previous => previous.map(r => r.id === next.id ? next : r));
      if (rows[0]?.id === next.id) onLatest?.(next);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not recover signing request"); }
    finally { setBusy(false); }
  }

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setError("Clipboard access failed."); }
  }

  if (!rows.length && !error) return null;
  return <div className="space-y-4 border-t border-border px-5 py-6 sm:px-8">
    <div><h3 className="text-[15px] font-semibold">Contract signing</h3>
      <p className="text-[12px] text-muted">Generated contracts are not proof of signature. Progress is tracked for each revision below.</p></div>
    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
    {rows.map(row => <section key={row.id} className="space-y-2 rounded-sm border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div>
        <p className="font-semibold">Revision {row.revision}: {row.state.replaceAll("_", " ")}</p>
        <p className="text-[12px] text-muted">{row.signedCount} of {row.totalCount} signed</p></div>
        {(row.state === "awaiting_signatures" || row.state === "preparing_completed_copy") &&
          <Button type="button" compact variant="secondary" disabled={busy} onClick={() => refresh(row)}>Refresh progress</Button>}
        {(["created", "creating", "creation_uncertain"].includes(row.state)) &&
          <Button type="button" compact variant="secondary" disabled={busy} onClick={() => recover(row)}>Check and resume request</Button>}
      </div>
      {row.recipients.map(person => <div key={person.email} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[13px]">
        <span><strong>{person.name}</strong> · {person.email} · {person.status === "SIGNED" ? "Signed" : row.state === "cancelled" ? "Link cancelled" : row.state === "failed" ? "Request failed" : "Awaiting signature"}</span>
        <span className="flex flex-wrap gap-2">
          {row.state === "awaiting_signatures" && person.status !== "SIGNED" && <Button type="button" compact variant="secondary" onClick={() => copy(person.link, `sign-${person.email}`)}>{copied === `sign-${person.email}` ? "Copied" : "Copy signing link"}</Button>}
          {person.copyToken && <Button type="button" compact variant="secondary" onClick={() => copy(`${window.location.origin}/host/signing/copy#${person.copyToken}`, `copy-${person.email}`)}>{copied === `copy-${person.email}` ? "Copied" : "Copy completed-copy link"}</Button>}
        </span>
      </div>)}
      <div className="flex flex-wrap gap-4 pt-2 text-[13px] underline">
        {row.files.original && <a href={`/api/host/signing/files/${orderId}/${row.id}/original`}>Original PDF</a>}
        {row.state === "signed" && <><a href={`/api/host/signing/files/${orderId}/${row.id}/completed`}>Completed contract</a>
          <a href={`/api/host/signing/files/${orderId}/${row.id}/audit`}>Signing record</a></>}
      </div>
      {row.error && <p className="text-[12px] text-warn">{row.error}</p>}
    </section>)}
  </div>;
}
