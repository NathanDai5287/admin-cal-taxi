"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [historyChanged, setHistoryChanged] = useState(false);
  const latestSeen = useRef<string | undefined>(undefined);
  const addedSignerId = useRef<string | null>(null);
  const clubs = [...new Set(cleanClubs(data.clubs).map(normalizeOrgName))];
  const currentPayload = useMemo(() => JSON.stringify(buildContractPayload(data, { sign: data.contractPresign })), [data]);
  const invalid = validate(data);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    latestSeen.current = undefined;
    function reload() { listSigningAction(orderId).then(async rows => {
      if (!active) return;
      if (rows[0]?.state === "awaiting_signatures" || rows[0]?.state === "preparing_completed_copy") {
        const latest = await syncSigningAction(orderId, rows[0].id).catch(() => rows[0]);
        rows[0] = latest;
      }
      if (active) {
        const latestId = rows[0]?.id ?? "";
        if (latestSeen.current === undefined) { latestSeen.current = latestId; setHistoryChanged(false); }
        else if (latestSeen.current !== latestId) setHistoryChanged(true);
        setRevisions(rows);
      }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load signing status"); }); }
    reload();
    window.addEventListener("focus", reload);
    return () => { active = false; window.removeEventListener("focus", reload); };
  }, [orderId]);

  function changeSigner(id: string, patch: Partial<ContractSigner>) {
    update("contractSigners", data.contractSigners.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function addSigner() {
    const id = crypto.randomUUID();
    addedSignerId.current = id;
    update("contractSigners", [...data.contractSigners, { id, fullName: "", email: "", club: clubs.length === 1 ? clubs[0] : "" }]);
  }

  async function prepare() {
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      await beforeSigningAction?.();
      const currentRevisions = orderId ? await listSigningAction(orderId) : [];
      const latestId = currentRevisions[0]?.id ?? "";
      if (orderId && (latestSeen.current === undefined || historyChanged || latestSeen.current !== latestId)) {
        setHistoryChanged(true);
        setRevisions(currentRevisions);
        throw new Error("Signing history changed elsewhere. Reload this order before preparing another contract.");
      }
      if (currentRevisions[0]?.state === "awaiting_signatures" &&
          !window.confirm("A signing request is awaiting signatures. Preparing a changed contract will cancel its outstanding links. Continue?")) return;
      const activeContract = currentRevisions.some(row => ["awaiting_signatures", "preparing_completed_copy", "signed"].includes(row.state));
      const savedId = orderId && activeContract ? orderId : await saveOrder();
      if (!savedId) throw new Error("Save the order before preparing signing.");
      const payload = buildContractPayload(data, { sign: data.contractPresign });
      const key = crypto.randomUUID();
      const revision = await prepareSigningAction(savedId, payload, key, latestId);
      if (orderId && revision.state === "preview") {
        const updatedOrderId = await saveOrder();
        if (!updatedOrderId) throw new Error("The preview was stored, but the order update failed. Retry saving before creating links.");
      }
      setPreview(revision);
      latestSeen.current = revision.id;
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

  return <div className="space-y-6 bg-canvas/40 px-5 py-5">
    {showPresignControl && <ContractPanel sign={data.contractPresign} onSignChange={value => update("contractPresign", value)} />}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="card-title">Contract signers</h3>
        <p className="card-subtitle mt-1.5">Add one or more representatives for each club. Everyone signs the same contract.</p>
      </div>
      <Button type="button" variant="secondary" compact onClick={addSigner}>Add representative</Button>
    </div>
    {data.contractSigners.length > 0 && <div className="divide-y divide-rule">
      {data.contractSigners.map((s, i) => <div key={s.id} className="grid min-w-0 gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <label className="min-w-0"><span className="field-label">Full name</span><input ref={input => {
          if (input && addedSignerId.current === s.id) { addedSignerId.current = null; input.focus(); }
        }} className="field-input" value={s.fullName} onChange={e => changeSigner(s.id, { fullName: e.target.value })} autoComplete="name" /></label>
        <label className="min-w-0"><span className="field-label">Email</span><input className="field-input" type="email" value={s.email} onChange={e => changeSigner(s.id, { email: e.target.value })} autoComplete="email" /></label>
        <label className="min-w-0"><span className="field-label">Club</span><select className="field-input" value={normalizeOrgName(s.club)} onChange={e => changeSigner(s.id, { club: e.target.value })}>
          <option value="">Select club</option>{clubs.map(club => <option key={club} value={club}>{club}</option>)}
        </select></label>
        <Button type="button" variant="text" className="min-h-10 self-end justify-self-end" aria-label={`Remove representative ${i + 1}`} onClick={() => update("contractSigners", data.contractSigners.filter(p => p.id !== s.id))}>Remove</Button>
      </div>)}
    </div>}
    {!data.contractPresign && <div className="grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
      <label className="min-w-0"><span className="field-label">Theta Xi representative name</span><input className="field-input" value={data.chapterSignerName} onChange={e => update("chapterSignerName", e.target.value)} /></label>
      <label className="min-w-0"><span className="field-label">Theta Xi representative email</span><input className="field-input" type="email" value={data.chapterSignerEmail} onChange={e => update("chapterSignerEmail", e.target.value)} /></label>
    </div>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button type="button" variant="secondary" compact disabled={busy || !!invalid || historyChanged} onClick={prepare}>{busy ? "Working…" : "Preview contract for signing"}</Button>
      {invalid && <span className="text-[12px] text-muted">{invalid}</span>}
      {historyChanged && <span className="text-[12px] text-warn">Signing history changed elsewhere. Reload the page before preparing a revision.</span>}
    </div>
    {preview && <div className="space-y-4 border-t border-rule pt-5">
      <div>
        <h3 className="card-title">Contract preview</h3>
        <p className="card-subtitle mt-1.5">Revision {preview.revision}: review the contract before creating signing links.</p>
      </div>
      <iframe title="Contract signing preview" className="h-[540px] w-full border border-rule bg-surface" src={`/api/host/signing/files/${preview.order_id}/${preview.id}/original`} />
      <Button type="button" compact disabled={busy || previewPayload !== currentPayload || preview.state !== "preview"} onClick={create}>Create signing links</Button>
      {previewPayload !== currentPayload && <p className="text-[12px] text-warn">Details changed after preview. Prepare a new revision.</p>}
    </div>}
    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
    {revisions.map(revision => <section key={revision.id} className="space-y-4 border-t border-rule pt-5" aria-label={`Signing progress for revision ${revision.revision}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="card-title">Revision {revision.revision}</h3>
          <p className={`mt-1.5 text-[14px] font-semibold ${revision.state === "signed" ? "text-ok" : revision.state === "failed" ? "text-warn" : "text-ink"}`}>{revision.state.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase())}</p>
          <p className="mt-1 text-[12px] tabular-nums text-muted">{revision.signedCount} of {revision.totalCount} signed</p>
        </div>
        {(revision.state === "awaiting_signatures" || revision.state === "preparing_completed_copy") && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => refresh(revision)}>Refresh progress</Button>}
        {(["created", "creating", "creation_uncertain"].includes(revision.state)) && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => recover(revision)}>Check and resume request</Button>}
      </div>
      <div className="divide-y divide-rule">
      {revision.recipients.map(person => <div key={person.email} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-semibold break-words [overflow-wrap:anywhere]">{person.name}</p>
            <span className={`text-[12px] ${person.status === "SIGNED" ? "text-ok" : "text-muted"}`}>{person.status === "SIGNED" ? "Signed" : revision.state === "cancelled" ? "Link cancelled" : revision.state === "failed" ? "Request failed" : "Awaiting signature"}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted [overflow-wrap:anywhere]">{person.email}{person.sentAt ? " · Link marked sent" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {revision.state === "awaiting_signatures" && person.status !== "SIGNED" && <Button type="button" variant="secondary" compact onClick={() => copy(person.link, `sign-${person.email}`)}>{copied === `sign-${person.email}` ? "Copied" : "Copy signing link"}</Button>}
          {revision.state === "awaiting_signatures" && person.status !== "SIGNED" && <Button type="button" variant="text" compact disabled={busy} onClick={() => markSent(revision, person.email, !person.sentAt)}>{person.sentAt ? "Undo sent" : "Mark sent"}</Button>}
          {person.copyToken && <Button type="button" variant="text" compact onClick={() => copyFinal(person.copyToken!, `copy-${person.email}`)}>{copied === `copy-${person.email}` ? "Copied" : "Copy completed-copy link"}</Button>}
        </div>
      </div>)}
      </div>
      {revision.state === "signed" && <div className="flex flex-wrap gap-4 text-[13px] font-semibold text-brand underline underline-offset-4">
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/completed`}>Completed contract</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/audit`}>Signing record</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/original`}>Original contract</a>
      </div>}
      {revision.error && <p className="text-[12px] text-warn">{revision.error}</p>}
    </section>)}
  </div>;
}
