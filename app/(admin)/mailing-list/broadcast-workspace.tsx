"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { useAppWriteAccess } from "@/components/auth/app-access-boundary";
import { parseRecipients, renderBroadcast, type Broadcast, type BroadcastInput, type MailingGroup } from "@/lib/mailing-list/broadcast";
import { INITIAL_BODY, INITIAL_SUBJECT } from "@/lib/mailing-list/initial-draft";
import { exportContactEmails } from "./actions";
import { getMailingBroadcastAnalytics, loadMailingBroadcast, prepareMailingBroadcast, refreshMailingBroadcast, saveBroadcastDraft, saveMailingGroup, sendMailingBroadcast } from "./broadcast-actions";
import type { BroadcastAnalytics } from "@/lib/mailing-list/analytics";

const fresh = (): BroadcastInput => ({ name: "October 2026 Nu News", list_id: null, newsletter_id: null, subject: INITIAL_SUBJECT, body: INITIAL_BODY, reply_to: "", postal_address: "" });

export function BroadcastWorkspace({ tab, groups, broadcasts, sender, issues }: { tab: string; groups: MailingGroup[]; broadcasts: Broadcast[]; sender: string; issues: { id: string; season: string; issue_date: string; finalized_at: string | null }[] }) {
  const router = useRouter();
  const canWrite = useAppWriteAccess();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState<MailingGroup | null>(null);
  const [groupId, setGroupId] = useState(() => crypto.randomUUID());
  const [listName, setListName] = useState("");
  const [source, setSource] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [current, setCurrent] = useState<Broadcast | null>(broadcasts[0] ?? null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<BroadcastInput>(broadcasts[0] ?? fresh());
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [analytics, setAnalytics] = useState<BroadcastAnalytics | null>(null);
  const parsed = useMemo(() => { try { return { ...parseRecipients(source), error: "" }; } catch (error) { return { recipients: [], invalid: [], duplicates: 0, error: String(error) }; } }, [source]);
  const selected = groups.find((item) => item.id === draft.list_id);
  const locked = !!current && current.status !== "draft";
  const count = locked ? current.recipient_count : selected?.recipients.length ?? 0;

  function run(action: () => Promise<void>) {
    if (!canWrite) return;
    setNotice(""); setFailed(false);
    startTransition(async () => { try { await action(); router.refresh(); } catch (error) { if (current && !dirty) { try { setCurrent(await loadMailingBroadcast(current.id)); } catch { /* Keep the last known saved message visible. */ } } setFailed(true); setNotice(error instanceof Error ? error.message : "This request failed. Try again."); } });
  }
  function change<K extends keyof BroadcastInput>(key: K, value: BroadcastInput[K]) { setDraft({ ...draft, [key]: value }); setDirty(true); setConfirmed(false); }
  function choose(row: Broadcast | null) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setCurrent(row); setDraft(row ?? fresh()); setDraftId(crypto.randomUUID()); setDirty(false); setConfirmed(false); setNotice(""); setAnalytics(null);
  }

  return <div className="grid min-w-0 gap-6">
    <header><h1 className="page-title">{tab === "lists" ? "Mailing lists" : "Broadcast email"}</h1><p className="page-lede">{tab === "lists" ? "Give your audience a name. Paste addresses to build a list for your next email." : "Write a note to your community, preview it, and send it to a saved list."}</p></header>
    {notice && <p className={failed ? "text-danger" : "text-brand"} role={failed ? "alert" : "status"}>{notice}</p>}
    {tab === "lists" ? <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
      <section className="card card-body grid gap-5" aria-labelledby="list-heading">
        <h2 className="card-title" id="list-heading">{group ? "Edit mailing list" : "Add a mailing list"}</h2>
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); run(async () => { const saved = await saveMailingGroup(listName, source, group?.id ?? groupId, group?.updated_at); setGroup(saved as unknown as MailingGroup); setNotice("Mailing list saved. It is ready to choose in Broadcast email."); }); }}>
          <fieldset disabled={pending || !canWrite} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          <label className="field-label">List name<input className="field-input mt-2 w-full" required maxLength={100} value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Alumni and friends" /></label>
          <label className="field-label">Email addresses<textarea className="field-input mt-2 min-h-64 w-full resize-y font-normal" required value={source} disabled={pending} onChange={(e) => { setSource(e.target.value); setPreviewed(false); }} placeholder={"alex@example.com\nsam@example.com\nTaylor <taylor@example.com>"} aria-describedby="paste-help" /></label>
          <p className="helper-text m-0" id="paste-help">Paste addresses separated by new lines, commas, or semicolons. Duplicates are removed. Up to 10,000 recipients per list.</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={pending || !source.trim()} onClick={() => setPreviewed(true)}>Preview recipients</Button><Button variant="text" type="button" disabled={pending} onClick={() => run(async () => { const result = await exportContactEmails(); if (!result.ok) throw new Error(result.message); setSource(result.emails); setPreviewed(true); })}>Use all address book emails</Button></div>
          {previewed && <div className="border-y border-rule py-4" role="status"><p className="m-0 font-semibold">{parsed.recipients.length.toLocaleString()} unique recipients · {parsed.duplicates} duplicates removed</p>{parsed.error && <p className="text-danger">{parsed.error}</p>}{parsed.invalid.length > 0 && <p className="text-danger">Fix {parsed.invalid.length} invalid entries: {parsed.invalid.slice(0, 5).join(", ")}</p>}<p className="mb-0 break-words text-sm text-muted">{parsed.recipients.slice(0, 5).map((r) => r.email).join(", ")}{parsed.recipients.length > 5 ? ", …" : ""}</p></div>}
          <div><Button type="submit" disabled={pending || !previewed || !listName.trim() || !parsed.recipients.length || !!parsed.invalid.length || !!parsed.error}>{pending ? "Saving…" : "Save mailing list"}</Button></div>
          </fieldset>
        </form>
      </section>
      <aside><h2 className="card-title mb-4">Saved lists</h2>{groups.length ? <ul className="m-0 list-none divide-y divide-rule p-0">{groups.map((item) => <li key={item.id}><button className="w-full cursor-pointer py-4 text-left hover:text-brand" disabled={pending} onClick={() => { setGroup(item); setListName(item.name); setSource(item.recipients.map((r) => r.email).join("\n")); setPreviewed(true); setNotice(""); }}><span className="block break-words font-semibold">{item.name}</span><span className="text-sm text-muted">{item.recipients.length.toLocaleString()} recipients</span></button></li>)}</ul> : <p className="text-sm text-muted">Your first saved list will appear here.</p>}<Button variant="text" disabled={pending} onClick={() => { setGroup(null); setGroupId(crypto.randomUUID()); setListName(""); setSource(""); setPreviewed(false); }}>Add another list</Button></aside>
    </div> : <>
      <div className="flex flex-wrap items-center gap-3"><label className="field-label" htmlFor="saved-broadcast">Saved broadcast</label><select id="saved-broadcast" className="field-input min-w-0 max-w-full" disabled={pending} value={current?.id ?? ""} onChange={(e) => choose(broadcasts.find((r) => r.id === e.target.value) ?? null)}><option value="">New broadcast</option>{broadcasts.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status}</option>)}</select><Button variant="text" disabled={pending} onClick={() => choose(null)}>New broadcast</Button></div>
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-2">
        <section aria-labelledby="compose-heading"><h2 className="card-title mb-5" id="compose-heading">Email details</h2><form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); run(async () => { const saved = await saveBroadcastDraft(draft, current?.id ?? draftId, current?.updated_at); setCurrent(saved as Broadcast); setDirty(false); setNotice("Draft saved."); }); }}>
          <fieldset className="m-0 grid min-w-0 gap-5 border-0 p-0" disabled={pending || locked || !canWrite}>
            <label className="field-label">Broadcast name<input className="field-input mt-2 w-full" required maxLength={100} value={draft.name} onChange={(e) => change("name", e.target.value)} /></label>
            <label className="field-label">Mailing list<select className="field-input mt-2 w-full" value={draft.list_id ?? ""} onChange={(e) => change("list_id", e.target.value || null)}><option value="">Choose a list</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.recipients.length.toLocaleString()})</option>)}</select></label>
            {!groups.length && <p className="helper-text m-0"><Link href="/mailing-list?tab=lists" className="text-brand underline">Add a mailing list</Link> to choose your recipients.</p>}
            <label className="field-label">Subject<input className="field-input mt-2 w-full" maxLength={200} value={draft.subject} onChange={(e) => change("subject", e.target.value)} /></label>
            <label className="field-label">Email body<textarea className="field-input mt-2 min-h-96 w-full resize-y font-normal" maxLength={50_000} value={draft.body} onChange={(e) => change("body", e.target.value)} aria-describedby="body-help" /></label>
            <p id="body-help" className="helper-text m-0">Line breaks are preserved. Web addresses become clickable links.</p>
            <label className="field-label">Newsletter link<select className="field-input mt-2 w-full" value={draft.newsletter_id ?? ""} onChange={(e) => change("newsletter_id", e.target.value || null)}><option value="">No newsletter link</option>{issues.map((issue) => <option key={issue.id} value={issue.id} disabled={!issue.finalized_at}>{issue.season} · {issue.issue_date}{!issue.finalized_at ? " (finalize in Nu News first)" : ""}</option>)}</select></label>
            <p className="helper-text m-0">The selected issue becomes public when you prepare the broadcast. Anyone with its link can read it without signing in. <Link href="/nu-news" className="text-brand underline">Manage Nu News</Link></p>
            <label className="field-label">Replies go to<input className="field-input mt-2 w-full" type="email" value={draft.reply_to} onChange={(e) => change("reply_to", e.target.value)} placeholder="Your email address" /></label>
            <label className="field-label">Chapter mailing address<textarea className="field-input mt-2 w-full resize-y" rows={2} maxLength={500} value={draft.postal_address} onChange={(e) => change("postal_address", e.target.value)} placeholder="Street address, city, state, ZIP" /></label>
          </fieldset>
          {!locked && canWrite && <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button><span className="text-sm text-muted">{dirty ? "Unsaved changes" : current ? "Saved" : "New draft"}</span></div>}
        </form></section>
        <section className="min-w-0" aria-labelledby="preview-heading"><h2 className="card-title mb-5" id="preview-heading">Email preview</h2><div className="mb-4 grid gap-2 break-words border-y border-rule py-4 text-sm"><p className="m-0"><strong>From:</strong> {locked ? current.sender : sender || "Sender needs configuration"}</p><p className="m-0"><strong>To:</strong> {selected?.name ?? "No mailing list selected"} · {count.toLocaleString()} recipients</p><p className="m-0"><strong>Subject:</strong> {draft.subject || "No subject yet"}</p></div>
          <iframe title="Broadcast email preview" sandbox="allow-same-origin" className="h-[1000px] w-full border border-rule bg-white" onLoad={(event) => { const frame = event.currentTarget; frame.style.height = `${Math.max(640, Math.min(1600, frame.contentDocument?.documentElement.scrollHeight ?? 1000))}px`; }} srcDoc={renderBroadcast({ ...draft, id: current?.id })} />
          <div className="mt-6 grid gap-4 border-t border-rule pt-5"><p className="m-0 text-sm text-muted">{current?.status === "sent" ? "Accepted by Resend for sending. Delivery results are available in Resend." : "Preparing freezes this message and its recipient list. Unsubscribed contacts are skipped by Resend."}</p>
            {current?.error && <p className="text-danger" role="alert">{current.error}</p>}
            {current?.resend_id && current.status !== "sent" && <Button variant="text" disabled={pending || !canWrite} onClick={() => run(async () => { const saved = await refreshMailingBroadcast(current.id); setCurrent(saved); setNotice(saved.status === "sent" ? "Resend has queued or sent this broadcast." : "No change in sending status."); })}>Check sending status</Button>}
            {(!current || current.status === "draft") && <Button variant="secondary" disabled={!canWrite || pending || dirty || !current || !draft.list_id || !draft.subject || !draft.body || !draft.reply_to || !draft.postal_address || (draft.body.includes("You can read the newsletter using the link below.") && !draft.newsletter_id)} onClick={() => run(async () => { const saved = await prepareMailingBroadcast(current!.id, current!.updated_at); setCurrent(saved); setNotice("Recipients are importing. Check preparation in a moment."); })}>{pending ? "Preparing…" : "Prepare broadcast"}</Button>}
            {current?.status === "preparing" && <Button variant="secondary" disabled={pending || !canWrite} onClick={() => run(async () => { const saved = await prepareMailingBroadcast(current.id, current.updated_at); setCurrent(saved); setNotice(saved.status === "ready" ? "Ready. Review the message and confirm below." : "Recipients are still importing. Check again shortly."); })}>{pending ? "Checking…" : "Check preparation"}</Button>}
            {current?.status === "ready" && <><label className="check-row"><input type="checkbox" checked={confirmed} disabled={pending || !canWrite} onChange={(e) => setConfirmed(e.target.checked)} /><span>I reviewed this message and want to send it to {count.toLocaleString()} recipients who agreed to receive these emails.</span></label><Button disabled={pending || !confirmed || !canWrite} onClick={() => run(async () => { setCurrent(await sendMailingBroadcast(current.id, current.updated_at, confirmed)); setConfirmed(false); setNotice("Broadcast accepted by Resend for sending."); })}>{pending ? "Sending…" : `Send to ${count.toLocaleString()} recipients`}</Button></>}
            {current?.resend_id && <a href={`https://resend.com/broadcasts/${current.resend_id}`} target="_blank" rel="noreferrer" className="text-sm text-brand underline">View broadcast in Resend</a>}
          </div>
        </section>
      </div>
      {current?.status === "sent" && <section className="border-t border-rule pt-6" aria-labelledby="activity-heading"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="card-title" id="activity-heading">Finalized broadcast · Activity</h2><Button variant="secondary" disabled={pending} onClick={() => { setFailed(false); setNotice(""); startTransition(async () => { try { setAnalytics(await getMailingBroadcastAnalytics(current.id)); } catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : "Activity could not be loaded."); } }); }}>{pending ? "Loading activity…" : analytics ? "Refresh activity" : "Load activity"}</Button></div><p className="helper-text">The sent message and published newsletter are locked. Opens are estimates; mail privacy tools and link scanners can affect counts. Unique newsletter visitors are browsers. Download clicks do not confirm reading.</p>
        {analytics && <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-rule"><th className="py-3">Activity</th><th className="py-3 text-right">Unique</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{[["Email opens", analytics.uniqueOpens, analytics.totalOpens], ["Email link clicks", analytics.uniqueClicks, analytics.totalClicks], ["Newsletter page visits", analytics.pageReaders, analytics.pageViews], ["PDF link opens", analytics.pdfReaders, analytics.pdfOpens], ["PDF download clicks", analytics.pdfDownloaders, analytics.pdfDownloads]].map(([label, unique, total]) => <tr key={label} className="border-b border-rule"><th className="py-3 font-normal">{label}</th><td className="py-3 text-right tabular-nums">{unique.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{total.toLocaleString()}</td></tr>)}</tbody></table></div><details className="mt-5"><summary className="cursor-pointer py-2 text-sm font-semibold">Email activity by recipient ({analytics.recipients.length.toLocaleString()})</summary><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-3">Email</th><th className="py-3 text-right">Opens</th><th className="py-3 text-right">Clicks</th></tr></thead><tbody>{analytics.recipients.map((r) => <tr key={r.email} className="border-t border-rule"><td className="break-all py-3">{r.email}</td><td className="text-right tabular-nums">{r.opens}</td><td className="text-right tabular-nums">{r.clicks}</td></tr>)}</tbody></table>{!analytics.recipients.length && <p className="text-sm text-muted">No opens or clicks recorded yet.</p>}</div></details></>}
      </section>}
    </>}
  </div>;
}
