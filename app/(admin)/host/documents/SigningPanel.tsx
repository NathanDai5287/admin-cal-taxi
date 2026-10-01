"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/brand/button";
import { cleanClubs, normalizeOrgName } from "@/lib/host-clubs";
import type { SharedState, ContractSigner } from "@/lib/host-shared-state";
import type { SigningRevision } from "@/lib/host-signing";
import { buildContractPayload } from "@/lib/host-documents";
import ContractPanel from "./ContractPanel";
import { createSigningLinksAction, listSigningAction, markSigningLinkSentAction, prepareSigningAction, reconcileSigningAction, syncSigningAction } from "./signing-actions";

function validate(data: SharedState): string | null {
  const clubs = [...new Set(cleanClubs(data.clubs).map(normalizeOrgName))];
  if (!clubs.length) return "Add a contracting club first.";
  if (!data.contractSigners.length) return "Add at least one club representative.";
  const emails = new Set<string>();
  for (const signer of data.contractSigners) {
    if (signer.fullName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer.email.trim())) {
      return "Enter a full name and valid email for every representative.";
    }
    if (!clubs.includes(normalizeOrgName(signer.club))) return "Choose a contracting club for every representative.";
    const email = signer.email.trim().toLowerCase();
    if (emails.has(email)) return "Each signer needs a different email address.";
    emails.add(email);
  }
  if (clubs.some(club => !data.contractSigners.some(s => normalizeOrgName(s.club) === club))) {
    return "Add at least one representative for each club.";
  }
  if (!data.contractPresign) {
    const email = data.chapterSignerEmail.trim().toLowerCase();
    if (data.chapterSignerName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Enter the Theta Xi representative’s full name and email.";
    }
    if (emails.has(email)) return "The Theta Xi representative needs a different email address.";
  }
  return null;
}

export default function SigningPanel({ data, update, orderId, saveOrder, showPresignControl = false, beforeSigningAction }: {
  data: SharedState;
  update: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;
  orderId: string;
  saveOrder: () => Promise<string | null>;
  showPresignControl?: boolean;
  beforeSigningAction?: () => Promise<void>;
}) {
  const [revisions, setRevisions] = useState<SigningRevision[]>([]);
  const [preview, setPreview] = useState<SigningRevision | null>(null);
  const [previewPayload, setPreviewPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const clubs = [...new Set(cleanClubs(data.clubs).map(normalizeOrgName))];
  const currentPayload = useMemo(() => JSON.stringify(buildContractPayload(data, { sign: data.contractPresign })), [data]);
  const invalid = validate(data);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    function reload() { listSigningAction(orderId).then(async rows => {
      if (!active) return;
      if (rows[0]?.state === "awaiting_signatures" || rows[0]?.state === "preparing_completed_copy") {
        const latest = await syncSigningAction(orderId, rows[0].id).catch(() => rows[0]);
        rows[0] = latest;
      }
      if (active) setRevisions(rows);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load signing status"); }); }
    reload();
    window.addEventListener("focus", reload);
    return () => { active = false; window.removeEventListener("focus", reload); };
  }, [orderId]);

  function changeSigner(id: string, patch: Partial<ContractSigner>) {
    update("contractSigners", data.contractSigners.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function prepare() {
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      await beforeSigningAction?.();
      const currentRevisions = orderId ? await listSigningAction(orderId) : [];
      const activeContract = currentRevisions.some(row => ["awaiting_signatures", "preparing_completed_copy", "signed"].includes(row.state));
      const savedId = orderId && activeContract ? orderId : await saveOrder();
      if (!savedId) throw new Error("Save the order before preparing signing.");
      const payload = buildContractPayload(data, { sign: data.contractPresign });
      const key = crypto.randomUUID();
      const revision = await prepareSigningAction(savedId, payload, key);
      if (orderId && revision.state === "preview") {
        const updatedOrderId = await saveOrder();
        if (!updatedOrderId) throw new Error("The preview was stored, but the order update failed. Retry saving before creating links.");
      }
      setPreview(revision);
      setPreviewPayload(JSON.stringify(payload));
      setRevisions(old => [revision, ...old.filter(r => r.id !== revision.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare contract");
    } finally { setBusy(false); }
  }

  async function create() {
    if (!preview || previewPayload !== currentPayload) { setError("Contract details changed. Preview the new PDF before creating links."); return; }
    setBusy(true); setError("");
    try {
      await beforeSigningAction?.();
      const revised = await createSigningLinksAction(preview.order_id, preview.id, preview.original_sha256);
      setPreview(revised);
      setRevisions(old => [revised, ...old.filter(r => r.id !== revised.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create signing links");
    } finally { setBusy(false); }
  }

  async function refresh(revision: SigningRevision) {
    setBusy(true); setError("");
    try {
      const updated = await syncSigningAction(revision.order_id, revision.id);
      setRevisions(old => old.map(r => r.id === updated.id ? updated : r));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not refresh status"); }
    finally { setBusy(false); }
  }

  async function recover(revision: SigningRevision) {
    setBusy(true); setError("");
    try {
      const updated = revision.state === "created"
        ? await createSigningLinksAction(revision.order_id, revision.id, revision.original_sha256)
        : await reconcileSigningAction(revision.order_id, revision.id);
      setRevisions(old => old.map(r => r.id === updated.id ? updated : r));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not recover signing request"); }
    finally { setBusy(false); }
  }

  async function copy(link: string, id: string) {
    try {
      if (id.startsWith("sign-")) {
        const current = await listSigningAction(orderId);
        const person = current[0]?.recipients.find(recipient => `sign-${recipient.email}` === id);
        if (current[0]?.state !== "awaiting_signatures" || person?.link !== link || person.status === "SIGNED") {
          setRevisions(current);
          throw new Error("This signing link is no longer active. Refresh the order before copying.");
        }
      }
      await navigator.clipboard.writeText(link); setCopied(id);
    }
    catch (err) { setError(err instanceof Error ? err.message : "Clipboard access failed. Open the link and copy it manually."); }
  }

  async function copyFinal(token: string, id: string) {
    await copy(`${window.location.origin}/host/signing/copy#${token}`, id);
  }

  async function markSent(revision: SigningRevision, email: string, sent: boolean) {
    setBusy(true); setError("");
    try {
      const updated = await markSigningLinkSentAction(revision.order_id, revision.id, email, sent);
      setRevisions(old => old.map(row => row.id === updated.id ? updated : row));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update link delivery"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5 border-t border-border px-5 py-6 sm:px-8">
    {showPresignControl && <ContractPanel sign={data.contractPresign} onSignChange={value => update("contractPresign", value)} />}
    <div>
      <h3 className="text-[15px] font-semibold">Contract signers</h3>
      <p className="text-[13px] text-muted">One or more representatives for each club. Every person signs the same contract on their own execution page.</p>
    </div>
    <div className="space-y-3">
      {data.contractSigners.map((s, i) => <div key={s.id} className="grid gap-2 rounded-sm border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="text-[12px] text-muted">Full name<input className="field-input mt-1 w-full" value={s.fullName} onChange={e => changeSigner(s.id, { fullName: e.target.value })} autoComplete="name" /></label>
        <label className="text-[12px] text-muted">Email<input className="field-input mt-1 w-full" type="email" value={s.email} onChange={e => changeSigner(s.id, { email: e.target.value })} autoComplete="email" /></label>
        <label className="text-[12px] text-muted">Club<select className="field-input mt-1 w-full" value={normalizeOrgName(s.club)} onChange={e => changeSigner(s.id, { club: e.target.value })}>
          <option value="">Select club</option>{clubs.map(club => <option key={club} value={club}>{club}</option>)}
        </select></label>
        <button type="button" className="self-end px-2 py-2 text-[13px] text-muted underline" aria-label={`Remove representative ${i + 1}`} onClick={() => update("contractSigners", data.contractSigners.filter(p => p.id !== s.id))}>Remove</button>
      </div>)}
      <Button type="button" variant="secondary" compact onClick={() => update("contractSigners", [...data.contractSigners, { id: crypto.randomUUID(), fullName: "", email: "", club: clubs.length === 1 ? clubs[0] : "" }])}>Add representative</Button>
    </div>
    {!data.contractPresign && <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-[12px] text-muted">Theta Xi representative name<input className="field-input mt-1 w-full" value={data.chapterSignerName} onChange={e => update("chapterSignerName", e.target.value)} /></label>
      <label className="text-[12px] text-muted">Theta Xi representative email<input className="field-input mt-1 w-full" type="email" value={data.chapterSignerEmail} onChange={e => update("chapterSignerEmail", e.target.value)} /></label>
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" compact disabled={busy || !!invalid} onClick={prepare}>{busy ? "Working…" : "Preview contract for signing"}</Button>
      {invalid && <span className="text-[12px] text-muted">{invalid}</span>}
    </div>
    {preview && <div className="space-y-3 rounded-sm border border-border p-4">
      <p className="text-[13px] font-semibold">Revision {preview.revision}: review the exact PDF that will be uploaded.</p>
      <iframe title="Contract signing preview" className="h-[540px] w-full border border-border" src={`/api/host/signing/files/${preview.order_id}/${preview.id}/original`} />
      <Button type="button" compact disabled={busy || previewPayload !== currentPayload || preview.state !== "preview"} onClick={create}>Create signing links</Button>
      {previewPayload !== currentPayload && <p className="text-[12px] text-warn">Details changed after preview. Prepare a new revision.</p>}
    </div>}
    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
    {revisions.map(revision => <div key={revision.id} className="space-y-2 rounded-sm border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">Revision {revision.revision}: {revision.state.replaceAll("_", " ")}</p>
          <p className="text-[12px] text-muted">{revision.signedCount} of {revision.totalCount} signed</p></div>
        {(revision.state === "awaiting_signatures" || revision.state === "preparing_completed_copy") && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => refresh(revision)}>Refresh progress</Button>}
        {(["created", "creating", "creation_uncertain"].includes(revision.state)) && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => recover(revision)}>Check and resume request</Button>}
      </div>
      {revision.recipients.map(person => <div key={person.email} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[13px]">
        <span><strong>{person.name}</strong> · {person.email} · {person.status === "SIGNED" ? "Signed" : revision.state === "cancelled" ? "Link cancelled" : revision.state === "failed" ? "Request failed" : "Awaiting signature"}{person.sentAt ? " · Link marked sent" : ""}</span>
        <span className="flex flex-wrap gap-2">
          {revision.state === "awaiting_signatures" && person.status !== "SIGNED" && <Button type="button" variant="secondary" compact onClick={() => copy(person.link, `sign-${person.email}`)}>{copied === `sign-${person.email}` ? "Copied" : "Copy signing link"}</Button>}
          {revision.state === "awaiting_signatures" && person.status !== "SIGNED" && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => markSent(revision, person.email, !person.sentAt)}>{person.sentAt ? "Undo sent" : "Mark sent"}</Button>}
          {person.copyToken && <Button type="button" variant="secondary" compact onClick={() => copyFinal(person.copyToken!, `copy-${person.email}`)}>{copied === `copy-${person.email}` ? "Copied" : "Copy completed-copy link"}</Button>}
        </span>
      </div>)}
      {revision.state === "signed" && <div className="flex flex-wrap gap-4 text-[13px] underline">
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/completed`}>Completed contract</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/audit`}>Signing record</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/original`}>Original contract</a>
      </div>}
      {revision.error && <p className="text-[12px] text-warn">{revision.error}</p>}
    </div>)}
  </div>;
}
