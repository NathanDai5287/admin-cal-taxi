"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/brand/button";
import OrderIcon from "@/components/host/OrderIcon";
import type { EmailPreview } from "@/lib/host-email";

type PdfPreview = { url: string; label: string; blob?: string };
const control = "inline-flex min-h-9 items-center justify-center gap-2 px-2.5 text-[12px] font-medium text-brand hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50";
const viewControl = "inline-flex min-h-9 items-center justify-center gap-2 border-b-2 px-2 py-1 text-[12px] hover:text-brand disabled:cursor-not-allowed disabled:opacity-50";

export default function OrderPreviewReader({ email, emails, contacts = [], index, onIndex, pdf, replyTo, preparing, busy, message, sendDisabled, sendLabel, onSend, onClose, onEmail, onDocument, onWarmDocument }: {
  email?: EmailPreview; emails: EmailPreview[]; index: number; onIndex: (index: number) => void;
  contacts?: { name: string; email: string }[];
  pdf: PdfPreview | null; replyTo: string; preparing: boolean; busy: boolean; message: string;
  sendDisabled: boolean; sendLabel: string; onSend: () => void; onClose: () => void; onEmail: () => void;
  onDocument: (url: string, name: string) => void; onWarmDocument: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState("page-width");
  const dialog = useRef<HTMLDialogElement>(null);
  const expandTrigger = useRef<HTMLButtonElement>(null);
  // The side reader remounts on collapse; focus its new trigger, not the
  // removed button that originally opened the dialog.
  const restoreFocus = useCallback(() => expandTrigger.current?.focus({ preventScroll: true }), []);
  const recipientId = useId();
  const hasContent = !!email || !!pdf;
  const alreadySent = !!email && emails.length > 0 && emails.every(row => row.status === "sent");
  const contactNames = new Map(contacts.map(person => [person.email.trim().toLowerCase(), person.name]));
  const recipientName = (address: string) => contactNames.get(address.trim().toLowerCase()) || address;
  const isExpanded = expanded && hasContent;
  useEffect(() => {
    if (!isExpanded || !dialog.current) return;
    const node = dialog.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => { document.body.style.overflow = previous; if (node.open) node.close(); restoreFocus(); };
  }, [isExpanded, restoreFocus]);

  function close() { setExpanded(false); onClose(); }
  const attachmentUrl = (i: number) => `/api/host/emails/${email!.id}/files/${i}`;
  const reader = <div className={`flex min-w-0 flex-col ${isExpanded ? "h-full" : ""}`}>
    <div className={`flex shrink-0 items-center justify-between gap-3 ${isExpanded ? "px-3 pt-4 sm:px-5" : ""}`}>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Preview</h2>{alreadySent && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok" aria-label="Email already sent"><OrderIcon name="check" className="h-3.5 w-3.5" />Sent</span>}</div>
      <div className="flex items-center gap-1">
        {hasContent && <button ref={isExpanded ? undefined : expandTrigger} type="button" className={control} onClick={() => setExpanded(!expanded)} aria-label={isExpanded ? "Return to side preview" : "Expand preview"}><OrderIcon name={isExpanded ? "collapse" : "expand"} /><span>{isExpanded ? "Collapse" : "Expand"}</span></button>}
        {hasContent && <button type="button" className={control} disabled={busy} onClick={close} aria-label="Close preview"><OrderIcon name="close" /></button>}
      </div>
    </div>
    {(busy || message) && <p role="status" aria-live="polite" className={`mt-2 text-[13px] text-ink [overflow-wrap:anywhere] ${isExpanded ? "px-3 sm:px-5" : ""}`}>{busy ? "Working…" : message}</p>}
    {!hasContent && <div className="mt-4 flex min-h-52 flex-col items-center justify-center gap-3 px-7 text-center text-[12px] text-muted"><OrderIcon name="file" className="h-7 w-7" /><p>Select a document or email to preview.</p></div>}
    {hasContent && <>
      <div className={`mt-3 shrink-0 ${isExpanded ? "px-3 sm:px-5" : ""}`}>
        {email && <>
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 text-[12px]">
            {emails.length > 1 ? <label htmlFor={recipientId} className="pt-1 text-muted">To</label> : <span className="text-muted">To</span>}
            {emails.length > 1 ? <select id={recipientId} className="field-input !min-h-8 !py-1 !text-[12px]" value={index} disabled={busy} onChange={e => onIndex(Number(e.target.value))}>{emails.map((p, i) => <option key={p.id || p.recipient} value={i}>{recipientName(p.recipient)}{recipientName(p.recipient) !== p.recipient ? ` · ${p.recipient}` : ""}{p.status === "sent" ? " · already sent" : ""}</option>)}</select>
              : <ul aria-label="Email recipients" className="flex flex-wrap gap-x-2 gap-y-0.5">{email.recipient.split(", ").map((address, i, recipients) => <li key={address} title={address} className="[overflow-wrap:anywhere]"><span>{recipientName(address)}</span>{recipientName(address) !== address && <span className="sr-only"> &lt;{address}&gt;</span>}{i < recipients.length - 1 && <span className="text-muted">,</span>}</li>)}</ul>}
            <span className="text-muted">Reply-to</span><p className="[overflow-wrap:anywhere]">{replyTo}</p>
            <span className="text-muted">Subject</span><p className="leading-relaxed text-muted [overflow-wrap:anywhere]">{email.subject}</p>
          </div>
        </>}
        {!email && pdf && <h3 className="text-[13px] font-semibold [overflow-wrap:anywhere]">{pdf.label}</h3>}
      </div>
      <div className={`mt-3 flex shrink-0 flex-wrap items-center gap-3 ${isExpanded ? "mx-3 sm:mx-5" : ""}`} role="group" aria-label="Preview views">
        {email && <button type="button" className={`${viewControl} ${!pdf ? "border-brand font-semibold text-brand" : "border-transparent text-muted"}`} aria-pressed={!pdf} onClick={onEmail}><OrderIcon name="mail" />Email</button>}
        {email?.attachments.map((name, i) => {
          const url = attachmentUrl(i);
          const active = !!pdf && new URL(pdf.url, "https://preview.invalid").pathname === url;
          return <button type="button" key={name} title={name} className={`${viewControl} ${active ? "border-brand font-semibold text-brand" : "border-transparent text-muted"}`} aria-pressed={active} disabled={!email.id} onPointerEnter={() => onWarmDocument(url)} onFocus={() => onWarmDocument(url)} onClick={() => { setZoom("page-width"); onDocument(url, name); }}><OrderIcon name="file" />{email.attachments.length === 1 ? "PDF" : /audit/i.test(name) ? "Audit trail" : "Contract PDF"}</button>;
        })}
        {pdf && <div className="ml-auto flex flex-wrap items-center gap-1">
          <label className="sr-only" htmlFor={`${recipientId}-zoom`}>PDF zoom</label>
          <select id={`${recipientId}-zoom`} className="min-h-9 bg-transparent px-2 text-[12px] text-ink" value={zoom} onChange={e => setZoom(e.target.value)}><option value="page-width">Fit width</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></select>
          <a className={control} href={pdf.blob ?? pdf.url} download={pdf.label.endsWith(".pdf") ? pdf.label : `${pdf.label}.pdf`} aria-label="Download previewed PDF"><OrderIcon name="download" /></a>
          <a className={control} href={pdf.blob ?? pdf.url} target="_blank" rel="noopener noreferrer" aria-label="Open PDF in a new tab"><OrderIcon name="external" /></a>
        </div>}
      </div>
      <div className={`mt-3 overflow-auto overscroll-contain bg-white ${isExpanded ? "mx-3 mb-3 min-h-0 flex-1 sm:mx-5 sm:mb-5" : pdf ? "h-[clamp(20rem,calc(100dvh_-_18rem),44rem)]" : "max-h-[clamp(20rem,calc(100dvh_-_18rem),44rem)]"}`}>
        {pdf ? pdf.blob ? <iframe key={`${pdf.blob}:${zoom}`} title={`${pdf.label} preview`} src={`${pdf.blob}#${zoom === "page-width" ? "view=FitH&zoom=page-width" : `zoom=${zoom}`}&toolbar=0&navpanes=0`} className="h-full w-full border-0 bg-white" /> : <div role="status" className="flex h-full items-center justify-center text-[13px] text-muted">Loading PDF…</div>
          : email && <EmailPage html={email.html} expanded={isExpanded} />}
      </div>
      {email && (!alreadySent || preparing || !email.id) && <div className={`shrink-0 py-3 ${isExpanded ? "px-3 sm:px-5" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!alreadySent && <Button compact className="!min-h-9 !text-[12px] !normal-case !tracking-normal" disabled={sendDisabled} onClick={() => { setExpanded(false); onSend(); }}>{sendLabel}</Button>}
          {(preparing || !email.id) && <p role="status" className="text-[12px] text-muted">{preparing ? "Preparing attachments…" : "Attachments unavailable. Select the email again to retry."}</p>}
        </div>
      </div>}
    </>}
  </div>;

  return <>
    {isExpanded ? <div className="flex min-h-64 items-center justify-center bg-surface"><button type="button" className={control} onClick={() => setExpanded(false)}><OrderIcon name="collapse" />Return to side preview</button></div> : reader}
    <dialog ref={dialog} aria-label="Expanded document preview" onCancel={e => { e.preventDefault(); setExpanded(false); }} className="fixed inset-0 m-auto h-dvh max-h-none w-screen max-w-[1200px] overflow-hidden bg-page p-0 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop:bg-black/45 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
      {isExpanded && reader}
    </dialog>
  </>;
}

/** Keep the email sandboxed, with one scroll area owned by the reader. */
function EmailPage({ html, expanded }: { html: string; expanded: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(720);
  const readableHtml = useMemo(() => {
    // Only the reading view changes. Frozen HTML sent to recipients stays exact.
    const style = `<style>html{color-scheme:light}body{background:white!important;font-size:${expanded ? 16 : 14}px!important}body>div{box-sizing:border-box;margin:0 auto!important;max-width:660px!important;padding:${expanded ? 32 : 24}px!important;overflow-wrap:anywhere}body>div>h1{font-size:${expanded ? 22 : 20}px!important;font-weight:600!important;line-height:1.3!important;margin:0 0 18px!important}body>div>p{line-height:1.65!important;margin:0 0 14px!important}body>div>p:first-child{font-size:14px!important;font-weight:600!important;margin-bottom:20px!important}body>div>p:last-child{font-size:${expanded ? 14 : 12}px!important;color:#536174!important;margin-top:22px!important;margin-bottom:0!important}body>div>p:last-child strong{color:#17253a}a:focus-visible{outline:2px solid #244c88;outline-offset:3px}::selection{background:#e8f2f9}@media(max-width:420px){body>div{padding:20px!important}}</style>`;
    return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : html.replace(/<body\b/i, `<head>${style}</head><body`);
  }, [html, expanded]);
  useEffect(() => () => observer.current?.disconnect(), [html]);
  function loaded() {
    observer.current?.disconnect();
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const measure = () => {
      const bottom = Math.max(0, ...Array.from(doc.body.children).map(child => child.getBoundingClientRect().bottom + (doc.defaultView?.scrollY ?? 0)));
      setHeight(Math.ceil(bottom) + 4);
    };
    measure();
    observer.current = new ResizeObserver(measure);
    for (const child of doc.body.children) observer.current.observe(child);
  }
  return <iframe ref={frame} title="Hosting email preview" sandbox="allow-same-origin" srcDoc={readableHtml} onLoad={loaded} style={{ height }} className="block w-full border-0 bg-white" />;
}
