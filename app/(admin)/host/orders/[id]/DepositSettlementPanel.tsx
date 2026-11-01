"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";
import { Button } from "@/components/brand/button";
import { prepareHostingEvidence } from "@/lib/host-evidence-upload";
import { DAMAGE_CATEGORIES, type ClubDamageHistory, type DamageCategory, type DepositSettlement } from "@/lib/host-settlement-types";
import type { EmailPreview } from "@/lib/host-email";
import { formatDateISO } from "@/lib/host-format";
import { sendHostingEmailAction, recordHostingDepositReturnAction } from "../email-actions";
import {
  prepareHostingEvidenceUploadsAction,
  prepareHostingSettlementEmailAction,
  recordHostingEvidenceAction,
  removeHostingEvidenceAction,
  saveHostingSettlementAction,
} from "../settlement-actions";

type EditorItem = { id: string; category: DamageCategory; description: string; amount: string; clubs: string[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const field = "field-input !min-h-9 !py-1.5 !text-[13px]";

function newItem(clubs: string[]): EditorItem {
  return { id: crypto.randomUUID(), category: "damage", description: "", amount: "", clubs: [...clubs] };
}

export default function DepositSettlementPanel({ orderId, depositAmount, clubs, today, settlement, history, canSettle }: {
  orderId: string;
  depositAmount: number;
  clubs: string[];
  today: string;
  settlement: DepositSettlement | null;
  history: ClubDamageHistory[];
  canSettle: boolean;
}) {
  const canWrite = useAppWriteAccess();
  const router = useRouter();
  const [open, setOpen] = useState(!!settlement);
  const [items, setItems] = useState<EditorItem[]>(() => settlement?.items.map(item => ({ ...item, amount: item.amount.toFixed(2) })) ?? [newItem(clubs)]);
  const [refundMethod, setRefundMethod] = useState(settlement?.refundMethod || "Zelle");
  const [refundDate, setRefundDate] = useState(settlement?.refundDate || today);
  const [busy, setBusy] = useState<"save" | "upload" | "prepare" | "send" | "return" | "remove" | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const editable = !settlement || settlement.status === "draft";
  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [items]);
  const formSignature = JSON.stringify({ items, refundMethod, refundDate });
  const [savedVersion, setSavedVersion] = useState(() => settlement ? { id: settlement.id, revision: settlement.revision, signature: formSignature } : null);
  const refund = Math.max(depositAmount - total, 0);
  const evidenceByItem = new Map(items.map(item => [item.id, settlement?.evidence.filter(file => file.itemId === item.id) ?? []]));

  function updateItem(id: string, patch: Partial<EditorItem>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setPreview(null); setMessage("");
  }
  function toggleClub(item: EditorItem, club: string) {
    const selected = item.clubs.includes(club) ? item.clubs.filter(value => value !== club) : [...item.clubs, club];
    updateItem(item.id, { clubs: selected });
  }
  function validItems() {
    if (!items.length || items.some(item => !item.description.trim() || !(Number(item.amount) > 0) || !item.clubs.length)) throw new Error("Every deduction needs a description, positive amount, and responsible club.");
    if (Math.round(total * 100) > Math.round(depositAmount * 100)) throw new Error("Deductions cannot exceed the deposit.");
  }
  async function save() {
    validItems();
    if (savedVersion?.signature === formSignature) return savedVersion;
    setBusy("save"); setMessage(""); setPreview(null);
    try {
      const result = await saveHostingSettlementAction({
        orderId, refundMethod, refundDate: refundDate || null,
        items: items.map(item => ({ ...item, amount: Number(item.amount) })),
      });
      if (!result.ok) throw new Error(result.error);
      setSavedVersion({ ...result.data, signature: formSignature });
      setMessage("Settlement saved.");
      return result.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The settlement could not be saved.");
      return null;
    } finally { setBusy(null); }
  }
  async function upload(itemId: string, event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])]; event.target.value = "";
    if (!selected.length) return;
    setBusy("upload"); setMessage("");
    try {
      const saved = await save();
      if (!saved) return;
      setBusy("upload");
      const prepared = await Promise.all(selected.map(prepareHostingEvidence));
      const targets = await prepareHostingEvidenceUploadsAction({ orderId, count: prepared.length });
      if (!targets.ok) throw new Error(targets.error);
      await Promise.all(prepared.map(async (photo, index) => {
        const target = targets.data[index];
        const url = new URL(`/storage/v1/object/upload/sign/hosting-damage-evidence/${target.path}`, process.env.NEXT_PUBLIC_SUPABASE_URL);
        url.searchParams.set("token", target.token);
        const response = await fetch(url, { method: "PUT", body: photo.blob, headers: { "content-type": "image/jpeg", "x-upsert": "false" } });
        if (!response.ok) throw new Error(`“${photo.filename}” did not upload. Try again.`);
      }));
      const recorded = await recordHostingEvidenceAction({ orderId, files: prepared.map((photo, index) => ({ path: targets.data[index].path, filename: photo.filename, itemId, caption: "" })) });
      if (!recorded.ok) throw new Error(recorded.error);
      setMessage(`${prepared.length} photo${prepared.length === 1 ? "" : "s"} added.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Photos could not be uploaded."); }
    finally { setBusy(null); }
  }
  async function removeEvidence(evidenceId: string) {
    setBusy("remove"); setMessage("");
    const result = await removeHostingEvidenceAction({ orderId, evidenceId });
    setBusy(null);
    if (!result.ok) { setMessage(result.error); return; }
    setMessage("Photo removed."); router.refresh();
  }
  async function prepareEmail() {
    setBusy("prepare"); setMessage(""); setPreview(null);
    try {
      const saved = await save();
      if (!saved) return;
      setBusy("prepare");
      const result = await prepareHostingSettlementEmailAction({ orderId, settlementRevision: saved.revision });
      if (!result.ok) throw new Error(result.error);
      setPreview(result.data[0]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The email could not be prepared."); }
    finally { setBusy(null); }
  }
  async function send() {
    if (!preview) return;
    if (!window.confirm(`Send this itemized settlement to ${preview.recipient}?`)) return;
    setBusy("send"); setMessage("");
    try {
      const result = await sendHostingEmailAction(orderId, [preview.id]);
      if (!result.ok) throw new Error(result.error);
      setMessage(result.data.errors.length ? result.data.errors.join(" ") : "Settlement email accepted for delivery.");
      if (!result.data.errors.length) setPreview(null);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delivery could not be confirmed. Retry the same preview."); }
    finally { setBusy(null); }
  }
  async function markReturned() {
    if (!window.confirm(`Confirm that ${money(refund)} was returned via ${refundMethod} on ${formatDateISO(refundDate)}?`)) return;
    setBusy("return"); setMessage("");
    const result = await recordHostingDepositReturnAction(orderId);
    setBusy(null);
    if (!result.ok) { setMessage(result.error); return; }
    setMessage("Deposit return recorded."); router.refresh();
  }

  if (!open) return <section className="border-b border-rule py-4" aria-label="Security deposit settlement">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Security deposit settlement</h2><p className="mt-1 text-[12px] text-muted">Itemize damage, attach evidence, and send the credit memo.</p></div>
      <Button compact variant="secondary" disabled={!canWrite || !canSettle} onClick={() => setOpen(true)}>Start settlement</Button>
    </div>
    {!canSettle && <p className="mt-2 text-[12px] text-muted">Available after the event, deposit receipt, and full rental payment.</p>}
    <History history={history} />
  </section>;

  return <section className="border-b border-rule py-5" aria-label="Security deposit settlement">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Security deposit settlement</h2><p className="mt-1 text-[12px] text-muted">{settlement?.status === "returned" ? "Completed record" : settlement?.status === "sent" ? "Notice sent · evidence and deductions locked" : "Draft · changes remain private until you send"}</p></div>
      <div className="text-right text-[12px] tabular-nums"><p className="text-muted">Deposit {money(depositAmount)}</p><p className="mt-1 font-semibold text-ink">Return {money(refund)}</p></div>
    </div>

    <div className="mt-5 space-y-3">
      {items.map((item, index) => <div key={item.id} className="bg-surface p-3">
        <div className="grid gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_7rem_auto]">
          <select aria-label={`Deduction ${index + 1} category`} className={field} value={item.category} disabled={!editable || !!busy} onChange={event => updateItem(item.id, { category: event.target.value as DamageCategory })}>{Object.entries(DAMAGE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input aria-label={`Deduction ${index + 1} description`} className={field} value={item.description} disabled={!editable || !!busy} placeholder="What was repaired or remediated?" maxLength={500} onChange={event => updateItem(item.id, { description: event.target.value })} />
          <input aria-label={`Deduction ${index + 1} amount`} className={`${field} tabular-nums`} type="number" min="0.01" step="0.01" value={item.amount} disabled={!editable || !!busy} placeholder="$0.00" onChange={event => updateItem(item.id, { amount: event.target.value })} />
          {editable && <button type="button" className="min-h-9 px-2 text-[12px] font-medium text-muted hover:text-warn disabled:opacity-50" disabled={!!busy || items.length === 1} onClick={() => setItems(current => current.filter(value => value.id !== item.id))}>Remove</button>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
          <span className="text-muted">Responsible:</span>{clubs.map(club => <label key={club} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={item.clubs.includes(club)} disabled={!editable || !!busy} onChange={() => toggleClub(item, club)} />{club}</label>)}
          {editable && <label className="ml-auto cursor-pointer font-medium text-brand hover:text-ink"><input type="file" className="sr-only" accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" multiple disabled={!!busy} onChange={event => { void upload(item.id, event); }} />{busy === "upload" ? "Adding photos…" : "Add photos"}</label>}
        </div>
        {!!evidenceByItem.get(item.id)?.length && <ul className="mt-3 flex flex-wrap gap-2">{evidenceByItem.get(item.id)!.map(photo => <li key={photo.id} className="group relative"><a href={photo.url} target="_blank" rel="noreferrer" title={photo.filename}><Image unoptimized src={photo.url} width={80} height={80} alt={photo.caption || `Evidence: ${item.description}`} className="h-20 w-20 object-cover" /></a>{editable && <button type="button" aria-label={`Remove ${photo.filename}`} disabled={!!busy} onClick={() => { void removeEvidence(photo.id); }} className="absolute right-0 top-0 bg-black/65 px-1.5 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">×</button>}</li>)}</ul>}
      </div>)}
    </div>
    {editable && <button type="button" className="mt-3 text-[12px] font-medium text-brand hover:text-ink" disabled={!!busy || items.length >= 25} onClick={() => setItems(current => [...current, newItem(clubs)])}>+ Add deduction</button>}

    <div className="mt-5 grid gap-5 border-t border-rule pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="text-[12px] text-muted">Return method<input className={`${field} mt-1 w-full text-ink`} value={refundMethod} disabled={!editable || !!busy} maxLength={120} onChange={event => { setRefundMethod(event.target.value); setPreview(null); }} /></label>
      <label className="text-[12px] text-muted">Return date<input className={`${field} mt-1 w-full text-ink`} type="date" value={refundDate} disabled={!editable || !!busy} onChange={event => { setRefundDate(event.target.value); setPreview(null); }} /></label>
      <dl className="grid grid-cols-[auto_auto] content-start gap-x-5 gap-y-1 text-[12px] tabular-nums"><dt className="text-muted">Deductions</dt><dd className="text-right">{money(total)}</dd><dt className="font-semibold">Return</dt><dd className="text-right font-semibold">{money(refund)}</dd></dl>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-3">
      {editable && <Button compact variant="secondary" disabled={!canWrite || !!busy} onClick={() => { void save(); }}>{busy === "save" ? "Saving…" : "Save draft"}</Button>}
      {editable && <Button compact disabled={!canWrite || !!busy || !canSettle} onClick={() => { void prepareEmail(); }}>{busy === "prepare" ? "Preparing…" : "Review email and credit memo"}</Button>}
      {settlement && settlement.status !== "returned" && refundDate <= today && <Button compact variant="text" disabled={!canWrite || !!busy || !settlement.noticeSentAt} onClick={() => { void markReturned(); }}>{busy === "return" ? "Recording…" : `Mark ${money(refund)} returned`}</Button>}
      {settlement && settlement.status !== "returned" && !settlement.noticeSentAt && <span className="text-[11px] text-muted">Send the notice before recording the return.</span>}
    </div>
    {message && <p role="status" aria-live="polite" className="mt-3 text-[13px] [overflow-wrap:anywhere]">{message}</p>}

    {preview && <div className="mt-5 grid gap-5 border-t border-rule pt-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div><div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px]"><span className="text-muted">To</span><span className="[overflow-wrap:anywhere]">{preview.recipient}</span><span className="text-muted">Subject</span><span>{preview.subject}</span></div><iframe title="Settlement email preview" sandbox="allow-same-origin" srcDoc={preview.html} className="mt-3 h-[32rem] w-full border-0 bg-white" /></div>
      <div><h3 className="text-sm font-semibold">Attachments</h3><ul className="mt-2 space-y-2 text-[12px]">{preview.attachments.map((name, index) => <li key={`${name}-${index}`}><a className="text-brand underline underline-offset-4" href={`/api/host/emails/${preview.id}/files/${index}`} target="_blank" rel="noreferrer">{name}</a></li>)}</ul><Button className="mt-5 w-full" compact disabled={!!busy || preview.status === "sent"} onClick={() => { void send(); }}>{busy === "send" ? "Sending…" : preview.status === "sent" ? "Already sent" : "Send settlement email"}</Button></div>
    </div>}
    <History history={history} />
  </section>;
}

function History({ history }: { history: ClubDamageHistory[] }) {
  if (!history.length) return null;
  return <details className="mt-5 border-t border-rule pt-4"><summary className="cursor-pointer text-[13px] font-medium text-brand">Prior damage history · {history.length} event{history.length === 1 ? "" : "s"}</summary><ul className="mt-3 space-y-2">{history.map(entry => <li key={entry.orderId} className="flex flex-wrap items-start justify-between gap-3 text-[12px]"><div><a className="font-medium text-ink hover:text-brand" href={`/host/orders/${entry.orderId}`}>{entry.eventDate ? formatDateISO(entry.eventDate) : entry.orderId}</a><p className="mt-0.5 text-muted">{entry.descriptions.join(" · ")}</p></div><span className="tabular-nums text-muted">{money(entry.total)}</span></li>)}</ul></details>;
}
