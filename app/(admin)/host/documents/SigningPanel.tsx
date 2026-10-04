"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/brand/button";
import { cleanClubs, normalizeOrgName } from "@/lib/host-clubs";
import type { SharedState } from "@/lib/host-shared-state";
import type { SigningRevision } from "@/lib/host-signing";
import { buildContractPayload } from "@/lib/host-documents";
import ChapterSigningFields from "@/components/host/ChapterSigningFields";
import RepresentativeFields from "@/components/host/RepresentativeFields";
import { orderSnapshot } from "@/lib/host-order-snapshot";
import { clubsDisplay } from "@/lib/host-clubs";
import { effective, effectiveRentalPrice } from "@/lib/host-derive";
import { getOrderAction } from "../orders/actions";
import { createSigningLinksAction, listSigningAction, prepareSigningAction, reconcileSigningAction, syncSigningAction } from "./signing-actions";

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

export default function SigningPanel({ data, update, orderId, saveOrder, reviewedOrderVersion, showPresignControl = false, preparationEnabled = true, initialRevisions, beforeSigningAction, onFinalized }: {
  data: SharedState;
  update: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void;
  orderId: string;
  saveOrder: () => Promise<string | null>;
  reviewedOrderVersion: () => string | undefined;
  showPresignControl?: boolean;
  preparationEnabled?: boolean;
  initialRevisions?: SigningRevision[];
  beforeSigningAction?: () => Promise<void>;
  onFinalized?: (orderId: string) => void | Promise<void>;
}) {
  const [revisions, setRevisions] = useState<SigningRevision[]>(initialRevisions ?? []);
  const [historyLoaded, setHistoryLoaded] = useState(initialRevisions !== undefined || !orderId);
  const [preview, setPreview] = useState<SigningRevision | null>(null);
  const [previewPayload, setPreviewPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [historyChanged, setHistoryChanged] = useState(false);
  const [editing, setEditing] = useState(false);
  const latestSeen = useRef<string | undefined>(undefined);
  const clubs = [...new Set(cleanClubs(data.clubs).map(normalizeOrgName))];
  const currentPayload = useMemo(() => JSON.stringify(buildContractPayload(data, { sign: data.contractPresign })), [data]);
  const invalid = validate(data);
  const activePayload = useRef(currentPayload);
  useEffect(() => { activePayload.current = currentPayload; }, [currentPayload]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function assertActive(expected: string) {
    if (!mounted.current || activePayload.current !== expected) throw new Error("Contract details changed while processing. Review and preview again.");
  }

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    latestSeen.current = undefined;
    function reload() { listSigningAction(orderId).then(async rows => {
      if (!active) return;
      const activeIndex = rows.findIndex(row => row.state === "awaiting_signatures" || row.state === "preparing_completed_copy");
      if (activeIndex >= 0) {
        rows[activeIndex] = await syncSigningAction(orderId, rows[activeIndex].id).catch(() => rows[activeIndex]);
      }
      if (active) {
        const latestId = rows[0]?.id ?? "";
        if (latestSeen.current === undefined) { latestSeen.current = latestId; setHistoryChanged(false); }
        else if (latestSeen.current !== latestId) setHistoryChanged(true);
        setRevisions(rows);
        setHistoryLoaded(true);
      }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load signing status"); }); }
    reload();
    window.addEventListener("focus", reload);
    return () => { active = false; window.removeEventListener("focus", reload); };
  }, [orderId]);


  async function prepare() {
    if (invalid) { setError(invalid); return; }
    const approvedPayload = currentPayload;
    setBusy(true); setError("");
    try {
      await beforeSigningAction?.();
      assertActive(approvedPayload);
      const currentRevisions = orderId ? await listSigningAction(orderId) : [];
      const latestId = currentRevisions[0]?.id ?? "";
      if (orderId && (latestSeen.current === undefined || historyChanged || latestSeen.current !== latestId)) {
        setHistoryChanged(true);
        setRevisions(currentRevisions);
        throw new Error("Signing history changed elsewhere. Reload this order before preparing another contract.");
      }
      const savedId = orderId || await saveOrder();
      if (!savedId) throw new Error("Save the order before preparing signing.");
      const payload = buildContractPayload(data, { sign: data.contractPresign });
      const key = crypto.randomUUID();
      assertActive(approvedPayload);
      const revision = await prepareSigningAction(savedId, payload, key, latestId);
      assertActive(approvedPayload);
      assertActive(approvedPayload);
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
    const approvedPayload = currentPayload;
    setBusy(true); setError("");
    try {
      await beforeSigningAction?.();
      assertActive(approvedPayload);
      const current = await listSigningAction(preview.order_id);
      const outstanding = current.filter(row => row.id !== preview.id && row.state === "awaiting_signatures");
      if (outstanding.length && !window.confirm(`Replace revision ${outstanding.map(row => row.revision).join(", ")}? Its outstanding links for ${outstanding.flatMap(row => row.recipients.filter(person => person.status !== "SIGNED").map(person => person.name)).join(", ")} will stop accepting signatures. The previous contract and signing record will be retained.`)) return;
      const saved = await getOrderAction(preview.order_id);
      if (!saved.ok) throw new Error(saved.error);
      const reviewedVersion = reviewedOrderVersion();
      if (!reviewedVersion || reviewedVersion !== saved.data.updatedAt) throw new Error("This order changed since you opened it. Reload and review the latest agreement before creating links.");
      assertActive(approvedPayload);
      const revised = await createSigningLinksAction(preview.order_id, preview.id, preview.original_sha256, {
        expectedUpdatedAt: reviewedVersion,
        clubName: clubsDisplay(data.clubs), eventDate: data.eventDate,
        rentalPrice: Number(effectiveRentalPrice(data)), depositAmount: Number(effective(data, "depositAmount")),
        snapshot: orderSnapshot(data), replacesRevisionIds: outstanding.map(row => row.id),
      });
      assertActive(approvedPayload);
      setPreview(null);
      setEditing(false);
      setRevisions(old => [revised, ...old.filter(r => r.id !== revised.id)]);
      await onFinalized?.(revised.order_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create signing links");
      const current = await listSigningAction(preview.order_id).catch(() => null);
      if (current) {
        setRevisions(current);
        if (current.find(row => row.id === preview.id)?.state !== "preview") { setPreview(null); setEditing(false); }
      }
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
      const updated = await reconcileSigningAction(revision.order_id, revision.id);
      setRevisions(old => old.map(r => r.id === updated.id ? updated : r));
      if (["awaiting_signatures", "preparing_completed_copy", "signed"].includes(updated.state)) await onFinalized?.(updated.order_id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not recover signing request"); }
    finally { setBusy(false); }
  }

  async function copy(link: string, id: string) {
    try {
      if (id.startsWith("sign-")) {
        const current = await listSigningAction(orderId);
        const active = current.find(revision => revision.state === "awaiting_signatures" && revision.recipients.some(recipient => recipient.link === link));
        const person = active?.recipients.find(recipient => `sign-${recipient.email}` === id);
        if (!active || person?.link !== link || person.status === "SIGNED") {
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


  const activeRevision = revisions.find(row => ["awaiting_signatures", "preparing_completed_copy", "signed", "activating", "created", "creating", "creation_uncertain"].includes(row.state));
  const history = revisions.filter(row => row.id !== activeRevision?.id && row.id !== preview?.id);
  const showPreparation = preparationEnabled && historyLoaded && (!activeRevision || editing || !!preview);
  return <div className="space-y-6 bg-canvas/40 px-5 py-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="card-title">{activeRevision ? "Current contract" : preparationEnabled ? "Review & signing" : "Contract signing"}</h2>
        <p className="card-subtitle mt-1.5">{activeRevision ? "Track signatures on the same contract. Payments are recorded separately." : !historyLoaded ? "Loading signing status…" : preparationEnabled ? "Review the named representatives and full PDF, then create their personal links." : "Use Edit order to review representatives and prepare signing links in a separate draft."}</p>
      </div>
      {preparationEnabled && activeRevision && !editing && <Button type="button" variant="text" compact onClick={() => setEditing(true)}>Prepare replacement</Button>}
    </div>
    {showPreparation && <div className="space-y-5">
      {showPresignControl ? <>
        {clubs.map(club => <div key={club} className="border-t border-rule pt-4"><h3 className="text-[14px] font-semibold">{club}</h3><RepresentativeFields data={data} update={update} club={club} /></div>)}
        <ChapterSigningFields data={data} update={update} />
      </> : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[14px] font-semibold">Representatives</h3><ButtonLink href="/host" variant="text" compact>Edit people</ButtonLink></div>
        {data.contractSigners.map(person => <div key={person.id} className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]"><strong>{person.fullName || "Name missing"}</strong><span>{person.club}</span><span className="text-muted break-all">{person.email || "Email missing"}</span></div>)}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4"><p className="text-[13px]">{data.contractPresign ? "Theta Xi: auto-sign with the generator’s chapter signature" : `Theta Xi: ${data.chapterSignerName || "Representative missing"} · ${data.chapterSignerEmail || "Email missing"}`}</p><ButtonLink href="/host/contract" variant="text" compact>Edit chapter signature</ButtonLink></div>
      </>}
      {activeRevision && <p className="field-hint">Existing signing links stay active while you prepare and review a replacement.</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button type="button" variant="primary" disabled={busy || !!invalid || historyChanged} onClick={prepare}>{busy ? "Preparing preview…" : "Preview contract"}</Button>
      {invalid && <span className="text-[12px] text-muted">{invalid}</span>}
      {historyChanged && <span className="text-[12px] text-warn">Signing history changed elsewhere. Reload the page before preparing a revision.</span>}
      </div>
    </div>}
    {preview && <div className="space-y-4 border-t border-rule pt-5">
      <div>
        <h3 className="card-title">Contract preview</h3>
        <p className="card-subtitle mt-1.5">Revision {preview.revision}: review the contract before creating signing links.</p>
      </div>
      <iframe title="Contract signing preview" className="h-[540px] w-full border border-rule bg-surface" src={`/api/host/signing/files/${preview.order_id}/${preview.id}/original`} />
      <div className="flex flex-wrap items-center gap-4"><Button type="button" disabled={busy || previewPayload !== currentPayload || preview.state !== "preview"} onClick={create}>{busy ? "Approving…" : "Approve contract"}</Button><p className="field-hint">Saves the approved agreement. Review and send its emails from the event timeline.</p></div>
      {previewPayload !== currentPayload && <p className="text-[12px] text-warn">Details changed after preview. Prepare a new revision.</p>}
    </div>}
    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
    {activeRevision && [activeRevision].map(revision => <section key={revision.id} className="space-y-4 border-t border-rule pt-5" aria-label={`Signing progress for revision ${revision.revision}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="card-title">Revision {revision.revision}</h3>
          <p className={`mt-1.5 text-[14px] font-semibold ${revision.state === "signed" ? "text-ok" : revision.state === "failed" ? "text-warn" : "text-ink"}`}>{revision.state.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase())}</p>
          <p className="mt-1 text-[12px] tabular-nums text-muted">{revision.signedCount} of {revision.totalCount} signed</p>
        </div>
        {(revision.state === "awaiting_signatures" || revision.state === "preparing_completed_copy") && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => refresh(revision)}>Refresh progress</Button>}
        {(["activating", "created", "creating", "creation_uncertain"].includes(revision.state)) && <Button type="button" variant="secondary" compact disabled={busy} onClick={() => recover(revision)}>Check and resume request</Button>}
      </div>
      {revision.files.original && revision.state !== "signed" && <a className="text-[13px] font-semibold text-brand underline" href={`/api/host/signing/files/${revision.order_id}/${revision.id}/original`}>View current contract: unsigned original</a>}
      {revision.state === "awaiting_signatures" && <div className="flex flex-wrap items-center gap-3"><p className="text-[13px]">Agreement approved. Send invitations and track progress from the event timeline.</p><ButtonLink href={`/host/orders/${revision.order_id}`} variant="primary" compact>Open event timeline</ButtonLink></div>}
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
          {person.copyToken && revision.state === "signed" && <Button type="button" variant="text" compact onClick={() => copyFinal(person.copyToken!, `copy-${person.email}`)}>{copied === `copy-${person.email}` ? "Copied" : "Copy final contract link"}</Button>}
        </div>
      </div>)}
      </div>
      {revision.state === "signed" && <div className="flex flex-wrap gap-4 text-[13px] font-semibold text-brand underline underline-offset-4">
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/completed`}>View signed contract</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/audit`}>Signing record</a>
        <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/original`}>Original contract</a>
      </div>}
      {revision.error && <p className="text-[12px] text-warn">{revision.error}</p>}
    </section>)}
    {history.length > 0 && <details className="border-t border-rule pt-4"><summary className="cursor-pointer text-[13px] font-semibold text-brand">Contract history ({history.length})</summary><div className="divide-y divide-rule mt-3">{history.map(revision => <div key={revision.id} className="py-3 text-[13px] space-y-2"><p>Revision {revision.revision}: {revision.state === "preview" ? "Draft preview" : revision.state.replaceAll("_", " ")} · {revision.signedCount} of {revision.totalCount} signed</p><div className="flex gap-4 text-brand underline">{revision.files.original && <a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/original`}>Original PDF</a>}{revision.state === "signed" && <><a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/completed`}>Signed PDF</a><a href={`/api/host/signing/files/${revision.order_id}/${revision.id}/audit`}>Signing record</a></>}</div></div>)}</div></details>}
  </div>;
}
