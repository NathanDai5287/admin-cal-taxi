"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { addDaysIso, formatDateISO } from "@/lib/host-format";
import { contractWasSent, currentRevision, EMAIL_LABELS, eventProgress, EVENT_STAGE_LABELS, signerProgress, type EmailKind, type EventWorkflow, type SignerProgress } from "@/lib/host-event";
import type { EmailPreview } from "@/lib/host-email";
import type { SigningRevision } from "@/lib/host-signing";
import type { Order } from "@/lib/host-orders-types";
import { cancelHostingEventAction, copyHostingSigningLinkAction, refreshHostingProgressAction, sendHostingEmailAction } from "../email-actions";
import { hostingEmailDraft } from "@/lib/host-email-draft";
import { createHostingDocumentCache, createHostingPreviewCache } from "@/lib/host-preview-client";
import { fmtUSD } from "../order-format";
import { sharedStateFromSnapshot } from "@/lib/host-state-model";
import OrderPreviewReader from "./OrderPreviewReader";

export default function OrderTimeline({ order, revisions, workflow, today, emailConfigured, signingUnavailable = false, rentalPaid, depositPaid = 0, permitPaid, permitTotal, previewReplyTo = "nathan.dai@berkeley.edu" }: {
  order: Order; revisions: SigningRevision[]; workflow: EventWorkflow; today: string; emailConfigured: boolean; signingUnavailable?: boolean;
  rentalPaid: number; depositPaid?: number; permitPaid: number; permitTotal: number; previewReplyTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [previews, setPreviews] = useState<EmailPreview[]>([]); const [previewIndex, setPreviewIndex] = useState(0);
  const [refund, setRefund] = useState(workflow.refund ?? { amount: order.depositAmount ?? 0, date: today, method: "" });
  const polling = useRef(false); const previewSection = useRef<HTMLElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [documents] = useState(createHostingDocumentCache);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; label: string; blob?: string; scope: string } | null>(null);
  useEffect(() => () => documents.clear(), [documents]);
  const selection = useRef(0);
  const documentSelection = useRef(0);
  const pausePolling = useRef(false);
  const revision = currentRevision(revisions);
  const representatives = sharedStateFromSnapshot(order.snapshot);
  const signerClubs = new Map(representatives.contractSigners.map(person => [person.email.trim().toLowerCase(), person.club.trim()]));
  if (representatives.chapterSignerEmail.trim()) signerClubs.set(representatives.chapterSignerEmail.trim().toLowerCase(), "Theta Xi");
  const progress = eventProgress(order.eventDate, revisions, workflow, today, order.statusOverride === "cancelled");
  const cancelled = progress.stage === "cancelled";
  const wasSent = contractWasSent(revision, workflow);
  const signed = revision?.state === "signed" || (!!revision && revision.totalCount > 0 && revision.signedCount >= revision.totalCount);
  const held = progress.stage === "held";
  const allowed = emailConfigured && !signingUnavailable && !cancelled && !!revision;
  const delivered = (kind: EmailKind) => workflow.deliveries.some(d => d.kind === kind && d.status === "sent" && d.revision_id === revision?.id);
  const hasUnsentInvitation = workflow.deliveries.some(d => d.kind === "invitation" && d.status !== "sent" && d.revision_id === revision?.id)
    || !!revision?.recipients.some(person => ["not_sent", "unconfirmed"].includes(signerProgress(person, revision, workflow).state));

  useEffect(() => {
    async function poll() {
      if (polling.current || pausePolling.current || document.visibilityState !== "visible" || cancelled) return;
      polling.current = true;
      try {
        const result = await refreshHostingProgressAction(order.id);
        router.refresh();
        if (!result.ok) setMessage(result.error);
      } catch { setMessage("Automatic signature refresh is unavailable. Reload to retry."); }
      finally { polling.current = false; }
    }
    const timer = setInterval(() => { void poll(); }, 60_000);
    window.addEventListener("focus", poll);
    // Initial render uses saved signing state, so no editor ever flashes.
    void poll();
    return () => { clearInterval(timer); window.removeEventListener("focus", poll); };
  }, [order.id, cancelled, router]);

  const scope = JSON.stringify([order.id, order.updatedAt, revision?.id, revision?.recipients.map(p => [p.email, p.status]), rentalPaid, depositPaid, today, cancelled]);
  const [previewScope, setPreviewScope] = useState("");
  useEffect(() => { pausePolling.current = busy || (previewScope === scope && (preparing || previews.length > 0)) || pdfPreview?.scope === scope; }, [busy, preparing, previews.length, previewScope, scope, pdfPreview?.scope]);
  const [cache] = useState(createHostingPreviewCache);
  // Undo followed by re-recording the same amount must not reuse a receipt
  // frozen against the previous payment IDs.
  useEffect(() => { cache.clear(); }, [cache, depositPaid, rentalPaid]);
  const warm = useCallback((kind: EmailKind) => {
    if (!revision) return Promise.reject(new Error("Approve a contract first."));
    const key = `${scope}:${kind}:${kind === "refund" ? JSON.stringify(refund) : ""}`;
    const request = cache.load(key, { orderId: order.id, revisionId: revision.id, expectedUpdatedAt: order.updatedAt, kind, ...(kind === "refund" ? { refund } : {}) });
    void request.then(rows => {
      // Every attachment in a batch is shared. Warm the first recipient's
      // bytes; other private messages stay in the lightweight email cache.
      rows[0]?.attachments.forEach((_name, i) => { void documents.load(`/api/host/emails/${rows[0].id}/files/${i}`).catch(() => {}); });
    }).catch(() => {});
    return request;
  }, [documents, cache, scope, order.id, order.updatedAt, revision, refund]);
  useEffect(() => {
    if (!allowed) return;
    // Warm independent previews concurrently, outside the Server Action queue.
    // No delivery or signing mutation is performed by these requests.
    const timer = setTimeout(() => {
      const kinds: EmailKind[] = [];
      if (revision?.state === "awaiting_signatures") { if (!wasSent || hasUnsentInvitation) kinds.push("invitation"); if (wasSent) kinds.push("reminder"); }
      if (wasSent) { kinds.push("deposit_invoice", "rental_invoice"); if (depositPaid > 0) kinds.push("deposit_receipt"); if (rentalPaid > 0) kinds.push("receipt"); }
      for (const kind of kinds) void warm(kind).catch(() => {});
      if (revision?.files.original) void documents.load(`/api/host/signing/files/${order.id}/${revision.id}/original`).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [allowed, revision?.state, wasSent, hasUnsentInvitation, rentalPaid, depositPaid, warm, documents, order.id, revision?.id, revision?.files.original]);
  const refundKey = JSON.stringify(refund);
  useEffect(() => {
    if (!allowed || !wasSent || rentalPaid < (order.rentalPrice ?? Infinity) || refund.amount <= 0 || !refund.method.trim()) return;
    const timer = setTimeout(() => { void warm("refund").catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [allowed, wasSent, rentalPaid, order.rentalPrice, refund.amount, refund.method, refundKey, warm]);

  async function prepare(kind: EmailKind, recipients?: string[]) {
    if (!revision) return;
    const token = ++selection.current; ++documentSelection.current;
    const choose = (rows: EmailPreview[]) => recipients?.length ? rows.filter(p => recipients.includes(p.recipient)) : rows;
    setMessage(""); setPdfPreview(null); setPreviewIndex(0); setPreparing(true); setPreviewScope(scope);
    try { setPreviews(choose(hostingEmailDraft(order, revision, kind, rentalPaid, previewReplyTo, refund, depositPaid))); }
    catch { setPreviews([]); setPreparing(false); setMessage("A personal signing link is unavailable. Reload signing progress and retry."); return; }
    // Desktop stays in place; mobile brings the preview into view.
    requestAnimationFrame(() => { if (window.innerWidth < 1024) previewSection.current?.scrollIntoView({ block: "start" }); });
    try {
      const rows = await warm(kind);
      if (token === selection.current) setPreviews(choose(rows));
    } catch (error) {
      if (token === selection.current) setMessage(error instanceof Error ? error.message : "Could not prepare the email. Please retry.");
    } finally { if (token === selection.current) setPreparing(false); }
  }
  async function openDocument(url: string, label: string) {
    const token = ++documentSelection.current;
    setMessage("");
    setPdfPreview({ url, label, blob: documents.ready(url), scope });
    requestAnimationFrame(() => { if (window.innerWidth < 1024) previewSection.current?.scrollIntoView({ block: "start" }); });
    try {
      const blob = await documents.load(url);
      if (token === documentSelection.current) setPdfPreview({ url, label, blob, scope });
    } catch (error) { if (token === documentSelection.current) setMessage(error instanceof Error ? error.message : "Could not load the PDF."); }
  }
  async function send() {
    if (preparing || previews.some(p => !p.id)) return;
    setBusy(true); setMessage("");
    try {
      const result = await sendHostingEmailAction(order.id, previews.map(p => p.id));
      if (result.ok) {
        setMessage(`${result.data.sent} email${result.data.sent === 1 ? "" : "s"} accepted${result.data.skipped ? `; ${result.data.skipped} skipped because they already signed` : ""}.${result.data.errors.length ? ` ${result.data.errors.join(" ")}` : ""}`);
        if (!result.data.errors.length) setPreviews([]);
        cache.clear(); router.refresh();
      } else setMessage(result.error);
    } catch { setMessage("Could not confirm delivery. Retry this same preview to avoid duplicate emails."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm("Cancel this event? It will leave the forecast, and future hosting emails will stop. Recorded payments, contracts, and existing signing links will remain; links are not revoked.")) return;
    setBusy(true);
    try { const result = await cancelHostingEventAction(order.id); if (result.ok) { setMessage("Event cancelled. Financial and signing history retained."); setPreviews([]); router.refresh(); } else setMessage(result.error); }
    catch { setMessage("Could not confirm cancellation. Reload to check the event."); }
    finally { setBusy(false); }
  }
  async function copy(email: string) {
    if (!revision) return;
    try { const result = await copyHostingSigningLinkAction(order.id, revision.id, email); if (!result.ok) { setMessage(result.error); return; } await navigator.clipboard.writeText(result.data); setMessage("Personal signing link copied."); } catch { setMessage("Clipboard unavailable. Reload and retry."); }
  }
  const emailButton = (kind: EmailKind, label: string, enabled = true) => <Button type="button" compact variant="secondary" disabled={busy || !allowed || !enabled} onPointerEnter={() => { void warm(kind).catch(() => {}); }} onFocus={() => { void warm(kind).catch(() => {}); }} onClick={() => prepare(kind)}>{label}</Button>;
  const visiblePdf = pdfPreview?.scope === scope ? pdfPreview : null;
  const selected = previewScope === scope ? previews[previewIndex] : undefined;
  const activity = workflow.deliveries.filter(d => d.status !== "queued");
  const unsentCount = previews.filter(p => p.status !== "sent").length;
  return <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
    <section className="min-w-0">
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-xl font-semibold text-ink">Event timeline</h2>
      <span className="text-[13px] font-medium text-brand">{signingUnavailable ? "Signing status unavailable" : EVENT_STAGE_LABELS[progress.stage]}{progress.total > 0 ? ` · ${progress.signed}/${progress.total} signed` : ""}</span>
    </div>
    {cancelled && <p className="mb-6 text-sm text-warn">This event is cancelled. Its signing and payment history is retained.</p>}
    {!emailConfigured && <p className="mb-6 text-sm text-warn">Hosting email is awaiting setup. You can still use the existing personal signing links.</p>}
    {signingUnavailable && <p className="mb-6 text-sm text-warn">Could not verify signing history. Reload before sending documents.</p>}
    <ol className="ml-2 border-l border-rule">
      <Milestone title="Prepare agreement" detail={`${fmtUSD(order.rentalPrice ?? 0)} rental fee · ${fmtUSD(order.depositAmount ?? 0)} refundable deposit`} done={!!revision || order.documents.some(d => d.kind === "contract") }>
        {revision ? <a className="text-[13px] font-semibold text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/original`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Approved contract"); }}>View approved contract · revision {revision.revision}</a> : <p className="text-sm text-muted">Use Edit order to prepare and approve the contract.</p>}
      </Milestone>
      <Milestone title="Send contract" detail={wasSent ? "Sent" : undefined} done={wasSent}>
        {(!wasSent || hasUnsentInvitation) && emailButton("invitation", hasUnsentInvitation ? "Review remaining invitations" : "Review & send contract")}
      </Milestone>
      <Milestone title="Everyone signs" detail={revision ? `${revision.signedCount} of ${revision.totalCount} signed` : "Awaiting contract approval"} done={signed}>
        {revision && <>
          <ul className="space-y-1">
            {revision.recipients.map(person => {
              const club = signerClubs.get(person.email.trim().toLowerCase());
              const signature = signerProgress(person, revision, workflow);
              return <li key={person.email} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-3 text-[13px] font-semibold"><span className="min-w-0 [overflow-wrap:anywhere]">{person.name}</span><SignatureIcon progress={signature} /></p>
                {club && <p className="mt-1 text-[12px] font-medium text-ink [overflow-wrap:anywhere]">{club}</p>}
                <p className="mt-1 text-[12px] text-muted [overflow-wrap:anywhere]">{person.email}</p>
              </div>
              {person.status !== "SIGNED" && revision.state === "awaiting_signatures" && !cancelled && <div className="flex flex-wrap gap-3"><Button compact variant="text" disabled={busy || !allowed || signature.state !== "pending"} onClick={() => prepare("reminder", [person.email])}>Remind</Button><Button compact variant="text" disabled={busy || signingUnavailable} onClick={() => copy(person.email)}>Copy link</Button></div>}
            </li>;
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-4">{!signed && emailButton("reminder", "Remind unsigned signers", wasSent && revision.state === "awaiting_signatures")}{signed && revision.files.completed && <a className="text-[13px] font-semibold text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/completed`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Signed contract"); }}>Download signed contract</a>}{signed && revision.files.audit && <a className="text-[13px] text-brand underline underline-offset-4" href={`/api/host/signing/files/${order.id}/${revision.id}/audit`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Audit trail"); }}>Audit trail</a>}</div>
        </>}
      </Milestone>
      <Milestone title="Send deposit invoice" detail={`Due ${formatDateISO(addDaysIso(order.eventDate, -7))}`} done={delivered("deposit_invoice")}>
        {emailButton("deposit_invoice", delivered("deposit_invoice") ? "View deposit email" : "Review deposit invoice", wasSent)}
      </Milestone>
      <Milestone title="Receive deposit" detail={`${fmtUSD(depositPaid)} of ${fmtUSD(order.depositAmount ?? 0)} received`} done={(order.depositAmount ?? 0) === 0 || depositPaid >= (order.depositAmount ?? 0)}>
        {emailButton("deposit_receipt", "Review deposit receipt", depositPaid > 0 && wasSent)}
      </Milestone>
      <Milestone title="Pay fire permit" detail={permitTotal > 0 ? `${fmtUSD(permitPaid)} of ${fmtUSD(permitTotal)} paid` : "No fire permit required."} done={permitTotal === 0 || permitPaid >= permitTotal}>
        {permitTotal > 0 && <a className="text-[13px] text-brand underline underline-offset-4" href="#event-finances">Update fire permit payment</a>}
      </Milestone>
      <Milestone title="Event held" detail={`${formatDateISO(order.eventDate)}`} done={held}>
        {held && !signed && <p className="text-[13px] text-warn">The event date has passed; {progress.total - progress.signed} signature{progress.total - progress.signed === 1 ? " is" : "s are"} still pending.</p>}
      </Milestone>
      <Milestone title="Send rental invoice" detail={`Due ${formatDateISO(addDaysIso(order.eventDate, 2))}`} done={delivered("rental_invoice")}>
        {emailButton("rental_invoice", delivered("rental_invoice") ? "View rental email" : "Review rental invoice", wasSent)}
      </Milestone>
      <Milestone title="Receipt & return deposit" detail={`${fmtUSD(rentalPaid)} rental payment received${workflow.refund ? ` · ${fmtUSD(workflow.refund.amount)} deposit returned` : ""}`} done={delivered("receipt") && delivered("refund")} last>
        {emailButton("receipt", "Review payment receipt", rentalPaid > 0 && wasSent)}
        <h4 className="mt-4 text-[13px] font-semibold">Deposit return</h4>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="field-label">Amount returned<input className="field-input mt-1" type="number" min="0.01" max={order.depositAmount ?? 0} step="0.01" value={refund.amount} disabled={!!workflow.refund} onChange={e => setRefund({ ...refund, amount: Number(e.target.value) })} /></label>
          <label className="field-label">Return date<input className="field-input mt-1" type="date" max={today} value={refund.date} disabled={!!workflow.refund} onChange={e => setRefund({ ...refund, date: e.target.value })} /></label>
          <label className="field-label sm:col-span-2">Return method<input className="field-input mt-1" value={refund.method} maxLength={120} placeholder="e.g. Zelle" disabled={!!workflow.refund} onChange={e => setRefund({ ...refund, method: e.target.value })} /></label>
          <div className="sm:col-span-2">{emailButton("refund", "Review return confirmation", wasSent && rentalPaid >= (order.rentalPrice ?? Infinity) && refund.amount > 0 && !!refund.method.trim())}</div>
        </div>
      </Milestone>
    </ol>
    {activity.length > 0 && <section className="mt-7" aria-label="Email activity">
      <h3 className="text-sm font-semibold">Email activity</h3>
      <ul className="mt-2 space-y-3">{activity.map(d => <li key={d.id} className="text-[12px]">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{EMAIL_LABELS[d.kind]}</span><span className={d.status === "failed" || d.status === "uncertain" ? "text-warn" : "text-muted"}>{d.status === "sent" ? "Sent" : d.status}</span></div>
        <p className="text-muted [overflow-wrap:anywhere]">{d.recipient} · {new Date(d.sent_at ?? d.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        {d.error && <p className="mt-1 text-warn [overflow-wrap:anywhere]">{d.error}</p>}
      </li>)}</ul>
    </section>}
    {!cancelled && <Button className="mt-5" variant="text" compact disabled={busy} onClick={cancel}>Cancel event</Button>}
    </section>
    <aside ref={previewSection} aria-label="Document previews" className="min-w-0 scroll-mt-6 pt-5 lg:sticky lg:top-6 lg:pt-0">
      <OrderPreviewReader email={selected} emails={previews} index={previewIndex} onIndex={index => { ++documentSelection.current; setPdfPreview(null); setPreviewIndex(index); }} pdf={visiblePdf} replyTo={previewReplyTo} preparing={preparing} busy={busy} message={message}
        sendDisabled={busy || preparing || previews.some(p => !p.id) || cancelled || previews.every(p => p.status === "sent")}
        sendLabel={busy ? "Sending…" : unsentCount === 0 ? "Already sent" : unsentCount === 1 ? "Send email" : `Send ${unsentCount} emails`} onSend={() => { void send(); }}
        onClose={() => { ++selection.current; ++documentSelection.current; setPreviews([]); setPreparing(false); setPdfPreview(null); }}
        onEmail={() => { ++documentSelection.current; setPdfPreview(null); }} onDocument={(url, label) => { void openDocument(url, label); }} onWarmDocument={url => { void documents.load(url).catch(() => {}); }} />
    </aside>
  </div>;
}
function Milestone({ title, detail, done, children, last = false }: { title: string; detail?: string; done: boolean; children?: ReactNode; last?: boolean }) {
  return <li className={`relative pl-7 ${last ? "pb-0" : "pb-5"}`}>
    <span aria-hidden="true" className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-surface ${done ? "border-brand text-brand" : "border-rule"}`}>{done && <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="2" /></svg>}</span>
    <h3 className="text-[15px] font-semibold text-ink">{title}<span className="sr-only">{done ? ", complete" : ", pending"}</span></h3>{detail && <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>}{children && <div className="mt-2">{children}</div>}
  </li>;
}
function SignatureIcon({ progress }: { progress: SignerProgress }) {
  const color = progress.state === "signed" ? "text-ok" : progress.state === "pending" ? "text-brand" : progress.state === "unconfirmed" ? "text-warn" : "text-muted";
  return <svg role="img" aria-label={progress.label} viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${color}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <title>{progress.label}</title>
    {progress.state === "signed" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
      : progress.state === "pending" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
      : progress.state === "not_sent" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>
      : <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>}
  </svg>;
}
