"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/brand/button";
import { clearTemplateConversation, generateTemplateSubmission, sendTemplateMessage } from "../../actions";
import type { DraftField } from "@/lib/accreditation/types";

type ChatItem = { role: "user" | "assistant"; content: string };

export function TemplateSubmissionChat({
  runId,
  initialMessages,
  initialDraft,
  initialMissing,
  initialReady,
  status,
  draftArtifact,
}: {
  runId: string;
  initialMessages: ChatItem[];
  initialDraft: { fields: Record<string, DraftField> };
  initialMissing: string[];
  initialReady: boolean;
  status: string;
  draftArtifact: { id: string; filename: string } | null;
}) {
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [draft, setDraft] = useState(initialDraft);
  const [missing, setMissing] = useState(initialMissing);
  const [ready, setReady] = useState(initialReady);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const busy = pending || status === "drafting";
  const resolvedCount = useMemo(() => Object.values(draft.fields).filter((field) => field.value).length, [draft]);

  function submit() {
    const content = input.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    setMessages((current) => [...current, { role: "user", content }]);
    startTransition(async () => {
      const form = new FormData();
      form.set("runId", runId);
      form.set("message", content);
      const result = await sendTemplateMessage(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: result.answer ?? "I updated the form." }]);
      if (result.draft) setDraft(result.draft as { fields: Record<string, DraftField> });
      setMissing(result.missing ?? []);
      setReady(Boolean(result.ready));
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card overflow-hidden">
        <div className="card-header"><div><span className="card-title">Tell us about this submission</span><p className="mt-1 text-xs text-muted">The assistant will handle the form’s fields and wording for you.</p></div><span className="badge badge-approved">Conversation saved</span></div>
        <div className="min-h-[420px] space-y-4 border-t border-rule bg-canvas p-4 sm:p-6" aria-live="polite">
          {!messages.length ? <div className="mx-auto flex min-h-[330px] max-w-md flex-col items-center justify-center text-center"><p className="text-lg font-bold">What should go in this form?</p><p className="mt-2 text-sm leading-relaxed text-muted">Give the assistant the names, dates, decisions, or context you know. It will ask only for details that are essential.</p></div> : null}
          {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[min(720px,90%)] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-brand text-white" : "border border-rule bg-surface text-ink"}`}><p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] opacity-70">{message.role === "user" ? "You" : "Assistant"}</p>{message.content}</div></article>)}
          {pending ? <div className="flex justify-start"><div className="border border-rule bg-surface px-4 py-3 text-sm text-muted" role="status">Thinking…</div></div> : null}
          <div ref={end} />
        </div>
        <div className="border-t border-rule bg-surface p-4 sm:p-5">
          {error ? <p role="alert" className="form-message mb-3">{error}</p> : null}
          <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex items-end gap-2 border border-rule bg-surface p-2 focus-within:border-brand">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} disabled={busy} rows={2} maxLength={4000} placeholder="e.g. Alex is the Big Brother and Jordan is the Little Brother…" className="max-h-40 min-h-14 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted" />
            <button type="submit" disabled={busy || !input.trim()} className="flex h-10 shrink-0 items-center justify-center bg-brand px-4 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40">Send</button>
          </form>
          <p className="mt-2 text-center text-xs text-muted">Use plain language. You can correct anything in a follow-up message.</p>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="card"><div className="card-header"><span className="card-title">Submission status</span></div><div className="card-body border-t border-rule space-y-3"><p className={`text-sm font-bold ${ready ? "text-ok" : "text-muted"}`}>{ready ? "Ready to generate" : "Waiting for essential details"}</p>{missing.length ? <p className="text-sm leading-relaxed text-muted">{missing.join(" · ")}</p> : <p className="text-sm leading-relaxed text-muted">The assistant has enough information to prepare this form.</p>}<p className="border-t border-rule pt-3 text-xs text-muted">{resolvedCount} detail{resolvedCount === 1 ? "" : "s"} resolved in this conversation.</p></div></section>
        <section className="card"><div className="card-header"><span className="card-title">Completed file</span></div><div className="card-body border-t border-rule space-y-3">{draftArtifact ? <a className="block bg-brand px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-white" href={`/api/accreditation/artifacts/${draftArtifact.id}`}>Download {draftArtifact.filename.split(".").pop()?.toUpperCase()}</a> : <form action={generateTemplateSubmission}><input type="hidden" name="runId" value={runId} /><Button type="submit" className="w-full" disabled={!ready || busy}>Generate completed form</Button></form>}<p className="text-xs leading-relaxed text-muted">Generation creates a downloadable draft. Review and archive it separately when it is ready.</p></div></section>
        <form action={clearTemplateConversation}><input type="hidden" name="runId" value={runId} /><button className="text-xs font-bold text-muted hover:text-warn" type="submit" disabled={busy}>Clear conversation</button></form>
      </aside>
    </div>
  );
}
