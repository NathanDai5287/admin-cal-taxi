"use client";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { formatDateISO } from "@/lib/host-format";
import { orderInvoiceDueDate, orderPaymentSchedule, formatRentalDeadline } from "@/lib/host-payment-schedule";
import { contractWasSent, currentRevision, EMAIL_LABELS, eventProgress, eventToday, EVENT_STAGE_LABELS, signerProgress, type EmailKind, type EventWorkflow, type SignerProgress } from "@/lib/host-event";
import type { EmailPreview } from "@/lib/host-email";
import type { SigningRevision } from "@/lib/host-signing";
import type { Order } from "@/lib/host-orders-types";
import { cancelHostingEventAction, copyHostingSigningLinkAction, recordHostingDepositReturnAction, refreshHostingProgressAction, sendHostingEmailAction } from "../email-actions";
import { hostingEmailDraft } from "@/lib/host-email-draft";
import { createHostingDocumentCache, createHostingPreviewCache } from "@/lib/host-preview-client";
import { fmtUSD } from "../order-format";
import { sharedStateFromSnapshot } from "@/lib/host-state-model";
import OrderPreviewReader from "./OrderPreviewReader";
import OrderIcon from "@/components/host/OrderIcon";
import OrderSigning from "./OrderSigning";
import OrderDateStrip from "./OrderDateStrip";
import { relativeTimelineDate, timelineDay, paymentCompletionDate, type TimelinePayment } from "@/lib/host-timeline";

const timelineAction = "inline-flex min-h-8 items-center gap-1.5 py-1 text-[12px] font-medium text-brand underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:text-muted disabled:no-underline";

export default function OrderTimeline({ financePanel, order, revisions, workflow, today, emailConfigured, signingUnavailable = false, rentalPaid, depositPaid = 0, permitPaid, permitTotal, previewReplyTo = "", paymentHistory = [] }: {
  financePanel: ReactNode; order: Order; revisions: SigningRevision[]; workflow: EventWorkflow; today: string; emailConfigured: boolean; signingUnavailable?: boolean;
  rentalPaid: number; depositPaid?: number; permitPaid: number; permitTotal: number; previewReplyTo?: string; paymentHistory?: TimelinePayment[];
}) {
  const canWrite = useAppWriteAccess();
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [previews, setPreviews] = useState<EmailPreview[]>([]); const [previewIndex, setPreviewIndex] = useState(0);
  const refund = workflow.refund ?? undefined;
  const polling = useRef(false); const previewSection = useRef<HTMLElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [reviewingContract, setReviewingContract] = useState(false);
  const [openEmails, setOpenEmails] = useState(false);
  const approvalContinuation = useRef(false);
  const [documents] = useState(createHostingDocumentCache);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; label: string; blob?: string; scope: string } | null>(null);
  useEffect(() => () => documents.clear(), [documents]);
  const selection = useRef(0);
  const documentSelection = useRef(0);
  const pausePolling = useRef(false);
  const revision = currentRevision(revisions);
  const revisionId = revision?.id;
  const representatives = sharedStateFromSnapshot(order.snapshot);
  const signerClubs = new Map(representatives.contractSigners.map(person => [person.email.trim().toLowerCase(), person.club.trim()]));
  if (representatives.chapterSignerEmail.trim()) signerClubs.set(representatives.chapterSignerEmail.trim().toLowerCase(), "Theta Xi");
  const schedule = orderPaymentSchedule(order);
  const rentalInvoiceDate = formatDateISO(orderInvoiceDueDate(order, "rental_invoice"));
  const depositInvoiceDate = formatDateISO(orderInvoiceDueDate(order, "deposit_invoice"));
  const canReturnDeposit = !!workflow.refund || representatives.rentalPaymentTiming !== "day_before" || today >= schedule.eventEndDate;
  const progress = eventProgress(order.eventDate, revisions, workflow, today, order.statusOverride === "cancelled");
  const cancelled = progress.stage === "cancelled";
  const wasSent = contractWasSent(revision, workflow);
  const signed = revision?.state === "signed" || (!!revision && revision.totalCount > 0 && revision.signedCount >= revision.totalCount);
  const held = progress.stage === "held";
  const allowed = canWrite && emailConfigured && !signingUnavailable && !cancelled && !!revision;
  const delivered = (kind: EmailKind) => workflow.deliveries.some(d => d.kind === kind && d.status === "sent" && d.revision_id === revision?.id);
  const hasUnsentInvitation = workflow.deliveries.some(d => d.kind === "invitation" && d.status !== "sent" && d.revision_id === revision?.id)
    || !!revision?.recipients.some(person => ["not_sent", "unconfirmed"].includes(signerProgress(person, revision, workflow).state));

  useEffect(() => {
    async function poll() {
      if (!canWrite || polling.current || pausePolling.current || document.visibilityState !== "visible" || cancelled) return;
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
  }, [canWrite, order.id, cancelled, router]);

  const scope = JSON.stringify([order.id, order.updatedAt, revision?.id, revision?.recipients.map(p => [p.email, p.status]), rentalPaid, depositPaid, refund, today, cancelled]);
  const [previewScope, setPreviewScope] = useState("");
  useEffect(() => { pausePolling.current = reviewingContract || busy || (previewScope === scope && (preparing || previews.length > 0)) || pdfPreview?.scope === scope; }, [reviewingContract, busy, preparing, previews.length, previewScope, scope, pdfPreview?.scope]);
  const [cache] = useState(createHostingPreviewCache);
  // Undo followed by re-recording the same amount must not reuse a receipt
  // frozen against the previous payment IDs.
  useEffect(() => { cache.clear(); }, [cache, depositPaid, rentalPaid]);
  const warm = useCallback((kind: EmailKind) => {
    if (!revisionId) return Promise.reject(new Error("Approve a contract first."));
    const key = `${scope}:${kind}:${kind === "refund" ? JSON.stringify(refund) : ""}`;
    const request = cache.load(key, { orderId: order.id, revisionId, expectedUpdatedAt: order.updatedAt, kind, ...(kind === "refund" ? { refund } : {}) });
    void request.then(rows => {
      // Every attachment in a batch is shared. Warm the first recipient's
      // bytes; other private messages stay in the lightweight email cache.
      rows[0]?.attachments.forEach((_name, i) => { void documents.load(`/api/host/emails/${rows[0].id}/files/${i}`).catch(() => {}); });
    }).catch(() => {});
    return request;
  }, [documents, cache, scope, order, revisionId, revision, refund]);
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
  useEffect(() => {
    if (!allowed || !wasSent || !refund) return;
    const timer = setTimeout(() => { void warm("refund").catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [allowed, wasSent, refund, warm]);

  async function markReturned() {
    setBusy(true); setMessage("");
    try {
      const result = await recordHostingDepositReturnAction(order.id);
      if (!result.ok) { setMessage(result.error); return; }
      setMessage("Deposit marked returned. Review the confirmation email below.");
      cache.clear(); router.refresh();
    } catch { setMessage("Could not confirm the deposit return. Reload to check its status."); }
    finally { setBusy(false); }
  }

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
  const reviewEmails = useEffectEvent(() => { void prepare("invitation"); });
  useEffect(() => {
    const continuedFromApproval = window.location.hash === "#review-emails" && !approvalContinuation.current;
    if ((!openEmails && !continuedFromApproval) || !revision || !allowed) return;
    approvalContinuation.current = true;
    setOpenEmails(false);
    reviewEmails();
  }, [openEmails, revision, allowed]);

  function reviewContract() {
    setReviewingContract(true);
    requestAnimationFrame(() => previewSection.current?.scrollIntoView({ block: "start" }));
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
    try { const result = await cancelHostingEventAction(order.id); if (result.ok) { setMessage("Event cancelled. Financial and signing history retained."); setPreviews([]); setReviewingContract(false); setOpenEmails(false); router.refresh(); } else setMessage(result.error); }
    catch { setMessage("Could not confirm cancellation. Reload to check the event."); }
    finally { setBusy(false); }
  }
  async function copy(email: string) {
    if (!revision) return;
    try { const result = await copyHostingSigningLinkAction(order.id, revision.id, email); if (!result.ok) { setMessage(result.error); return; } await navigator.clipboard.writeText(result.data); setMessage("Personal signing link copied."); } catch { setMessage("Clipboard unavailable. Reload and retry."); }
  }
  const emailButton = (kind: EmailKind, label: string, enabled = true) => kind === "invitation" && !wasSent
    ? <Button compact className="gap-1.5" disabled={!canWrite || busy || preparing || !allowed || !enabled} onClick={() => prepare(kind)}><OrderIcon name="mail" className="h-3.5 w-3.5" />{label}</Button>
    : <button type="button" className={timelineAction} disabled={!canWrite || busy || !allowed || !enabled} onPointerEnter={() => { void warm(kind).catch(() => {}); }} onFocus={() => { void warm(kind).catch(() => {}); }} onClick={() => prepare(kind)}><OrderIcon name="mail" className="h-3.5 w-3.5" />{label}</button>;
  const visiblePdf = pdfPreview?.scope === scope ? pdfPreview : null;
  const selected = previewScope === scope ? previews[previewIndex] : undefined;
  const activity = workflow.deliveries.filter(d => d.status !== "queued");
  const unsentCount = previews.filter(p => p.status !== "sent").length;
  const rentalBeforeEvent = schedule.rentalDueDate < order.eventDate;
  const rentalContractDate = formatRentalDeadline(schedule.rentalDueDate, representatives.rentalPaymentTiming);
  const rentalDeadline = rentalContractDate === rentalInvoiceDate ? `Due ${rentalContractDate}` : `Contract due ${rentalContractDate} · Invoice due ${rentalInvoiceDate}`;
  const invoiceTiming = wasSent ? "Ready now · Contract sent" : "After contract is sent";
  const eventDates = schedule.eventEndDate === order.eventDate ? formatDateISO(order.eventDate) : `${formatDateISO(order.eventDate)}–${formatDateISO(schedule.eventEndDate)}`;
  function sentDate(kind: EmailKind) {
    const timestamps = workflow.deliveries.filter(delivery => delivery.kind === kind && delivery.status === "sent" && delivery.revision_id === revision?.id)
      .map(delivery => delivery.sent_at).filter((date): date is string => !!date);
    if (kind === "invitation") timestamps.push(...(revision?.recipients.map(person => person.sentAt).filter((date): date is string => !!date) ?? []));
    return timestamps.length ? eventToday(new Date(timestamps.sort()[0])) : null;
  }
  const undatedSteps = [
    { label: "Approve contract", done: !!revision, date: null, waiting: "Ready now" },
    { label: "Send contract", done: wasSent, date: sentDate("invitation"), waiting: revision ? "Ready now" : "After contract approval" },
    { label: "Everyone signs", done: signed, date: null, waiting: wasSent ? "Waiting for remaining signatures" : "After contract is sent" },
    { label: "Send deposit invoice", done: delivered("deposit_invoice"), date: sentDate("deposit_invoice"), waiting: invoiceTiming },
    { label: "Send rental invoice", done: delivered("rental_invoice"), date: sentDate("rental_invoice"), waiting: invoiceTiming },
    { label: "Pay fire permit", done: permitTotal === 0 || permitPaid >= permitTotal, date: paymentCompletionDate(paymentHistory.filter(payment => payment.kind === "fire_permit"), permitTotal), waiting: "Ready now" },
    { label: "Return deposit", done: !!workflow.refund, date: workflow.refund?.date ?? null, waiting: canReturnDeposit && rentalPaid >= (order.rentalPrice ?? Infinity) ? "Ready now" : representatives.rentalPaymentTiming === "day_before" ? "After the event and full rental payment" : "After full rental payment" },
  ];
  const completedDates = undatedSteps.filter(step => step.done && step.date).map(step => ({ label: step.label, date: step.date!, detail: `Completed · ${formatDateISO(step.date!)}` }));
  const undated = undatedSteps.filter(step => !step.done || !step.date).map(step => ({
    label: step.label,
    detail: step.label === "Pay fire permit" && permitTotal === 0 ? "Not required" : step.done ? "Completed · Completion date unavailable" : cancelled ? "Cancelled" : `No deadline · ${step.waiting}`,
  }));
  const completedPayments = [
    { label: "Receive deposit", date: paymentCompletionDate(paymentHistory.filter(payment => payment.kind === "deposit"), order.depositAmount ?? 0) },
    { label: "Receive rental payment", date: paymentCompletionDate(paymentHistory.filter(payment => payment.kind === "revenue"), order.rentalPrice ?? 0) },
  ].filter(payment => payment.date).map(payment => ({ label: payment.label, date: payment.date!, detail: `Completed · ${formatDateISO(payment.date!)}` }));
  const timelineDates = [
    { label: "Now", date: today, detail: formatDateISO(today) },
    ...completedDates,
    ...completedPayments,
    { label: "Receive deposit · Deadline", date: depositInvoiceDate, detail: depositInvoiceDate },
    { label: "Receive rental payment · Deadline", date: schedule.rentalDueDate, detail: rentalContractDate },
    { label: "Event held", date: order.eventDate, detail: eventDates },
    ...(timelineDay(rentalInvoiceDate) !== timelineDay(schedule.rentalDueDate) ? [{ label: "Rental invoice deadline", date: rentalInvoiceDate, detail: rentalInvoiceDate }] : []),
  ];
  const rentalMilestones = <>
    <Milestone title="Send rental invoice" done={delivered("rental_invoice")}>
      {!delivered("rental_invoice") && <p className="text-[12px] text-muted">{invoiceTiming}</p>}
      {emailButton("rental_invoice", delivered("rental_invoice") ? "View rental email" : "Review rental invoice", wasSent)}
    </Milestone>
    <Milestone title="Receive rental payment" detail={<Deadline date={schedule.rentalDueDate} label={rentalDeadline} today={today} />} done={rentalPaid >= (order.rentalPrice ?? Infinity)}>
      <p className="text-[12px] text-muted">{fmtUSD(rentalPaid)} / {fmtUSD(order.rentalPrice ?? 0)}</p>
      {emailButton("receipt", "Review rental receipt", rentalPaid > 0 && wasSent)}
    </Milestone>
  </>;
  return <>
    <div className="grid items-start gap-8 border-b border-rule pb-4 lg:grid-cols-4">
      <div className="min-w-0 lg:col-span-3">{financePanel}</div>
      <section id="deposit-return-details" aria-label="Deposit return details" className="min-w-0 scroll-mt-6">
        <div className="text-[13px]">
          <span className="font-medium">Deposit return</span>
          <span className="ml-2 tabular-nums text-muted">{fmtUSD(workflow.refund?.amount ?? depositPaid)}</span>
          <span className={`mt-1 flex items-center gap-1.5 text-[12px] ${workflow.refund ? "text-ok" : "text-muted"}`}>
            {workflow.refund && <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 8 3 3 7-7" /></svg>}
            {workflow.refund ? "Returned" : "Not returned"}
          </span>
        </div>
        {!workflow.refund && <>
          <Button compact variant="secondary" className="mt-2" disabled={!canWrite || busy || cancelled || signingUnavailable || !wasSent || !canReturnDeposit || rentalPaid < (order.rentalPrice ?? Infinity) || depositPaid <= 0} onClick={() => { void markReturned(); }}>Mark returned</Button>
          <p className="mt-1 text-[12px] text-muted">{!canReturnDeposit ? "After the event ends" : rentalPaid < (order.rentalPrice ?? Infinity) ? "After full rental payment" : depositPaid <= 0 ? "After the deposit is received" : "Record after you return the deposit."}</p>
        </>}
      </section>
    </div>
    <div className="mt-7 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
    <section aria-label="Event timeline" className="min-w-0">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-xl font-semibold text-ink">Event timeline</h2>
      <span className="text-[13px] font-medium text-brand">{signingUnavailable ? "Signing status unavailable" : EVENT_STAGE_LABELS[progress.stage]}{progress.total > 0 ? ` · ${progress.signed}/${progress.total} signed` : ""}</span>
    </div>
    <OrderDateStrip dates={timelineDates} undated={undated} today={today} endDate={schedule.eventEndDate} />
    {cancelled && <p className="mb-6 text-sm text-warn">This event is cancelled. Its signing and payment history is retained.</p>}
    {emailConfigured && !previewReplyTo && <p className="mb-6 text-sm text-warn">Assign a treasurer with an email in <a href="/users" className="underline">Users</a> before preparing a new email.</p>}
    {!emailConfigured && <p className="mb-6 text-sm text-warn">Hosting email is awaiting setup. You can still use the existing personal signing links.</p>}
    {signingUnavailable && <p className="mb-6 text-sm text-warn">Could not verify signing history. Reload before sending documents.</p>}
    <ol aria-label="Event stages" className="ml-2 border-l border-rule">
      <Milestone title="Approve contract" detail={`${fmtUSD(order.rentalPrice ?? 0)} rental · ${fmtUSD(order.depositAmount ?? 0)} deposit`} done={!!revision}>
        {revision ? <a className={timelineAction} href={`/api/host/signing/files/${order.id}/${revision.id}/original`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Approved contract"); }}><OrderIcon name="file" className="h-3.5 w-3.5" />Approved contract · revision {revision.revision}</a> : <Button compact disabled={!canWrite || busy || reviewingContract || cancelled || signingUnavailable} onClick={reviewContract}>{reviewingContract ? "Reviewing contract…" : "Review contract"}</Button>}
      </Milestone>
      <Milestone title="Send contract" detail={wasSent ? "Sent" : "Draft until sent"} done={wasSent}>
        {!revision && <p className="text-[12px] text-muted">Approve the contract to review its emails.</p>}
        {(!wasSent || hasUnsentInvitation) && revision && emailButton("invitation", wasSent && hasUnsentInvitation ? "Review remaining invitations" : "Review emails")}
      </Milestone>
      <Milestone title="Everyone signs" detail={revision ? `${revision.signedCount} of ${revision.totalCount} signed` : "Awaiting contract approval"} done={signed}>
        {revision && <>
          <ul aria-label="Contract signers" className="mt-2 space-y-1 text-[12px]">
            {revision.recipients.map(person => {
              const club = signerClubs.get(person.email.trim().toLowerCase());
              const signature = signerProgress(person, revision, workflow);
              return <li key={person.email} className="grid grid-cols-[1rem_minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-x-2.5 py-1">
                <span className="pt-0.5"><SignatureIcon progress={signature} /></span>
                <div className="min-w-0"><p className="font-medium text-ink [overflow-wrap:anywhere]">{person.name}</p><a href={`mailto:${person.email}`} title={person.email} className="mt-0.5 block truncate text-[11px] text-muted hover:text-brand">{person.email}</a>
                  {person.status !== "SIGNED" && revision.state === "awaiting_signatures" && !cancelled && <div className="flex flex-wrap gap-x-3"><button type="button" className={timelineAction} disabled={!canWrite || busy || !allowed || signature.state !== "pending"} onClick={() => prepare("reminder", [person.email])}><OrderIcon name="mail" className="h-3.5 w-3.5" />Remind<span className="sr-only"> {person.name}</span></button><button type="button" className={timelineAction} disabled={!canWrite || busy || signingUnavailable} onClick={() => copy(person.email)}>Copy link<span className="sr-only"> for {person.name}</span></button></div>}
                </div>
                <p className="leading-snug text-muted [overflow-wrap:anywhere]">{club || "—"}</p>
              </li>;
            })}
          </ul>
          <div className="mt-1 flex flex-wrap items-center gap-x-4">{!signed && emailButton("reminder", "Remind unsigned signers", wasSent && revision.state === "awaiting_signatures")}{signed && revision.files.completed && <a className={timelineAction} href={`/api/host/signing/files/${order.id}/${revision.id}/completed`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Signed contract"); }}><OrderIcon name="file" className="h-3.5 w-3.5" />Signed contract</a>}{signed && revision.files.audit && <a className={timelineAction} href={`/api/host/signing/files/${order.id}/${revision.id}/audit`} onClick={e => { e.preventDefault(); void openDocument(e.currentTarget.href, "Audit trail"); }}>Audit trail</a>}</div>
        </>}
      </Milestone>
      <Milestone title="Send deposit invoice" done={delivered("deposit_invoice")}>
        {!delivered("deposit_invoice") && <p className="text-[12px] text-muted">{invoiceTiming}</p>}
        {emailButton("deposit_invoice", delivered("deposit_invoice") ? "View deposit email" : "Review deposit invoice", wasSent)}
      </Milestone>
      <Milestone title="Receive deposit" detail={<Deadline date={depositInvoiceDate} label={`Due ${depositInvoiceDate}`} today={today} />} done={(order.depositAmount ?? 0) === 0 || depositPaid >= (order.depositAmount ?? 0)}>
        <p className="text-[12px] text-muted">{fmtUSD(depositPaid)} / {fmtUSD(order.depositAmount ?? 0)}</p>
        {emailButton("deposit_receipt", "Review deposit receipt", depositPaid > 0 && wasSent)}
      </Milestone>
      {rentalBeforeEvent && rentalMilestones}
      <Milestone title="Pay fire permit" detail={permitTotal > 0 ? `${fmtUSD(permitPaid)} / ${fmtUSD(permitTotal)}` : "Not required"} done={permitTotal === 0 || permitPaid >= permitTotal}>
        {permitTotal > 0 && <a className={timelineAction} href="#event-finances">Update fire permit payment</a>}
      </Milestone>
      <Milestone title="Event held" detail={<Deadline date={order.eventDate} label={`Event dates · ${eventDates}`} today={today} />} done={held}>
        {held && !signed && <p className="text-[13px] text-warn">The event date has passed; {progress.total - progress.signed} signature{progress.total - progress.signed === 1 ? " is" : "s are"} still pending.</p>}
      </Milestone>
      {!rentalBeforeEvent && rentalMilestones}
      <Milestone title="Return deposit" detail={workflow.refund ? `${fmtUSD(workflow.refund.amount)} returned` : (representatives.rentalPaymentTiming === "day_before" ? "After the event and full rental payment" : "After full rental payment")} done={!!workflow.refund} last>
        {emailButton("refund", "Review deposit return confirmation", wasSent && !!workflow.refund)}
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
    {!cancelled && <Button className="mt-5" variant="text" compact disabled={!canWrite || busy || reviewingContract} onClick={cancel}>Cancel event</Button>}
    </section>
    <aside ref={previewSection} aria-label="Document previews" className="min-w-0 scroll-mt-6 pt-5 lg:sticky lg:top-6 lg:pt-0">
      {reviewingContract && !cancelled && !signingUnavailable ? <>
        <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[13px] text-muted">Approve, then review emails</span><Button variant="text" compact onClick={() => setReviewingContract(false)}>Close review</Button></div>
        <OrderSigning key={order.id} order={order} revisions={revisions} reviewContract onApproved={() => { setReviewingContract(false); setOpenEmails(true); router.refresh(); }} />
      </> : <OrderPreviewReader email={selected} emails={previews} contacts={revision?.recipients} index={previewIndex} onIndex={index => { ++documentSelection.current; setPdfPreview(null); setPreviewIndex(index); }} pdf={visiblePdf} replyTo={previewReplyTo} preparing={preparing} busy={busy} message={message}
        sendDisabled={busy || preparing || previews.some(p => !p.id) || cancelled || previews.every(p => p.status === "sent")}
        sendLabel={busy ? "Sending…" : unsentCount === 0 ? "Already sent" : unsentCount === 1 ? "Send email" : `Send ${unsentCount} emails`} onSend={() => { void send(); }}
        onClose={() => { ++selection.current; ++documentSelection.current; setPreviews([]); setPreparing(false); setPdfPreview(null); }}
        onEmail={() => { ++documentSelection.current; setPdfPreview(null); }} onDocument={(url, label) => { void openDocument(url, label); }} onWarmDocument={url => { void documents.load(url).catch(() => {}); }} />}
    </aside>
  </div>
  </>;
}
function Deadline({ date, label, today }: { date: string; label: string; today: string }) {
  return <span className="block text-right"><span className="block">{label}</span><span className="block">{relativeTimelineDate(date, today)}</span></span>;
}
function Milestone({ title, detail, done, children, last = false }: { title: string; detail?: ReactNode; done: boolean; children?: ReactNode; last?: boolean }) {
  return <li className={`relative pl-5 ${last ? "pb-0" : "pb-3"}`}>
    <span aria-hidden="true" className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-surface ${done ? "border-brand text-brand" : "border-rule"}`}>{done && <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="2" /></svg>}</span>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"><h3 className="text-[15px] font-bold text-ink">{title}<span className="sr-only">{done ? ", complete" : ", pending"}</span></h3>{detail && <p className="ml-auto max-w-full text-right text-[12px] text-muted tabular-nums">{detail}</p>}</div>{children && <div className="mt-1">{children}</div>}
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
