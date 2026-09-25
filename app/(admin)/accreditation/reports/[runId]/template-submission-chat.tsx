"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/brand/button";
import { clearTemplateConversation, generateTemplateSubmission, sendTemplateMessage } from "../../actions";
import type { DraftField } from "@/lib/accreditation/types";
import type { TemplateChatResult, TemplateSourceSummary } from "@/lib/accreditation/template-drafting";

type ChatItem = { role: "user" | "assistant"; content: string };

export function TemplateSubmissionChat({
  runId,
  initialMessages,
  initialDraft,
  initialMissing,
  initialReady,
  initialReview,
  fieldLabels,
  status,
  draftArtifact,
}: {
  runId: string;
  initialMessages: ChatItem[];
  initialDraft: { fields: Record<string, DraftField> };
  initialMissing: string[];
  initialReady: boolean;
  initialReview: Pick<TemplateChatResult, "warnings" | "sources" | "ruleChecks">;
  fieldLabels: Record<string, string>;
  status: string;
  draftArtifact: { id: string; filename: string } | null;
}) {
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [draft, setDraft] = useState(initialDraft);
  const [missing, setMissing] = useState(initialMissing);
  const [ready, setReady] = useState(initialReady);
  const [review, setReview] = useState(initialReview);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const busy = pending || status === "drafting" || status === "approved";
  const resolvedCount = useMemo(() => Object.values(draft.fields).filter((field) => field.value).length, [draft]);
  const generatedCount = useMemo(() => Object.values(draft.fields).filter((field) => field.value && field.provenance === "generated").length, [draft]);
  const sourceDocuments = useMemo(() => [...new Map(review.sources.map((source) => [`${source.kind}:${source.sourceId ?? source.title}`, source])).values()], [review.sources]);

  function sourceHref(source: TemplateSourceSummary) {
    if (!source.sourceId) return undefined;
    const id = encodeURIComponent(source.sourceId);
    if (source.kind === "policy") return `/api/policy/sources/${id}`;
    if (source.kind === "saved_submission") return `/accreditation/reports/${id}`;
    if (source.kind === "evidence" || source.kind === "prior_submission") return `/api/accreditation/sources/${id}`;
    return undefined;
  }

  function submit(suggestion?: string) {
    const content = (suggestion ?? input).trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    setMessages((current) => [...current, { role: "user", content }]);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("runId", runId);
        form.set("message", content);
        const result = await sendTemplateMessage(form);
        if (result.error) {
          setError(result.error);
          setInput(content);
          setMessages((current) => current.slice(0, -1));
          return;
        }
        setMessages((current) => [...current, { role: "assistant", content: result.answer ?? "I updated the form." }]);
        if (result.draft) setDraft(result.draft as { fields: Record<string, DraftField> });
        setMissing(result.missing ?? []);
        setReady(Boolean(result.ready));
        setReview({ warnings: result.warnings ?? [], sources: result.sources ?? [], ruleChecks: result.ruleChecks ?? [] });
        requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      } catch {
        setError("The assistant could not be reached. Your message is ready to retry.");
        setInput(content);
        setMessages((current) => current.slice(0, -1));
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card overflow-hidden">
        <div className="card-header"><div><span className="card-title">Create this year’s draft</span><p className="mt-1 text-xs text-muted">Use prior examples and chapter guidance to create a fresh version.</p></div><span className={`badge ${pending || error ? "badge-pending" : "badge-approved"}`}>{pending ? "Saving…" : error ? "Retry needed" : "Conversation saved"}</span></div>
        <div className="min-h-[420px] space-y-4 border-t border-rule bg-canvas p-4 sm:p-6" aria-live="polite">
          {!messages.length ? <div className="mx-auto flex min-h-[330px] max-w-md flex-col items-center justify-center text-center"><p className="text-lg font-bold">Start with a new version</p><p className="mt-2 text-sm leading-relaxed text-muted">The assistant can propose plausible activities, goals, and schedule details using your form and previous submissions. Add any facts you want it to keep.</p><Button type="button" className="mt-5" disabled={busy} onClick={() => submit("Draft a new version for this academic year, similar in theme and structure to the available prior submissions, but with different plausible activities and logistics. Follow chapter guidelines and preserve any facts I have supplied.")}>Draft a new version</Button></div> : null}
          {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[min(720px,90%)] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-brand text-white" : "border border-rule bg-surface text-ink"}`}><p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] opacity-70">{message.role === "user" ? "You" : "Assistant"}</p>{message.content}</div></article>)}
          {pending ? <div className="flex justify-start"><div className="border border-rule bg-surface px-4 py-3 text-sm text-muted" role="status">Thinking…</div></div> : null}
          <div ref={end} />
        </div>
        <div className="border-t border-rule bg-surface p-4 sm:p-5">
          {error ? <p role="alert" className="form-message mb-3">{error}</p> : null}
          <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex items-end gap-2 border border-rule bg-surface p-2 focus-within:border-brand">
            <textarea aria-label="Instructions for this draft" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} disabled={busy} rows={2} maxLength={4000} placeholder="Make a schedule like last year’s, with different activities…" className="max-h-40 min-h-14 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted" />
            <button type="submit" disabled={busy || !input.trim()} className="flex h-10 shrink-0 items-center justify-center bg-brand px-4 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40">Send</button>
          </form>
          <p className="mt-2 text-center text-xs text-muted">Use plain language. You can correct anything in a follow-up message.</p>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="card"><div className="card-header"><span className="card-title">Submission status</span></div><div className="card-body border-t border-rule space-y-3"><p className={`text-sm font-bold ${ready ? "text-ok" : "text-muted"}`}>{ready ? "Ready to generate" : resolvedCount ? "Waiting for essential details" : "Ready to start drafting"}</p>{missing.length ? <p className="text-sm leading-relaxed text-muted">{missing.join(" · ")}</p> : <p className="text-sm leading-relaxed text-muted">{ready ? "The draft can be downloaded for review." : "Describe what you need, or start with a new version."}</p>}<p className="border-t border-rule pt-3 text-xs text-muted">{resolvedCount} detail{resolvedCount === 1 ? "" : "s"} filled · {generatedCount} AI proposed</p></div></section>
        {resolvedCount > 0 || review.warnings.length > 0 ? <section className="card"><div className="card-header"><span className="card-title">Review this draft</span></div><div className="card-body border-t border-rule space-y-4">
          {review.warnings.length ? <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="text-sm text-muted">Review the proposed details before submitting.</p>}
          <details><summary className="cursor-pointer text-sm font-bold text-brand">Filled details ({resolvedCount})</summary><dl className="mt-3 space-y-4">{Object.entries(draft.fields).filter(([, field]) => field.value).map(([key, field]) => <div key={key}><dt className="text-sm font-bold">{fieldLabels[key] ?? key.replaceAll("_", " ")}<span className="mt-1 block text-xs font-normal text-muted">{{ generated: "AI proposed", user_input: "Admin supplied", retrieved: "From source", app_snapshot: "Academic calendar" }[field.provenance]}</span></dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{field.value}</dd></div>)}</dl></details>
          {sourceDocuments.length ? <details><summary className="cursor-pointer text-sm font-bold text-brand">Sources consulted ({sourceDocuments.length})</summary><ul className="mt-3 space-y-3 text-sm">{sourceDocuments.map((source) => <li key={source.ref}>{sourceHref(source) ? <a className="font-bold text-brand underline" href={sourceHref(source)}>{source.title}</a> : <span className="font-bold">{source.title}</span>}<span className="mt-1 block text-xs text-muted">{source.kind.replaceAll("_", " ")}</span></li>)}</ul></details> : null}
          {review.ruleChecks.length ? <details><summary className="cursor-pointer text-sm font-bold text-brand">Rules applied ({review.ruleChecks.length})</summary><ul className="mt-3 space-y-3 text-sm leading-relaxed">{review.ruleChecks.map((check, index) => <li key={`${check.ref}-${index}`}><p>{check.application}</p><blockquote className="mt-1 text-xs text-muted">“{check.quote}”</blockquote><p className="mt-1 text-xs text-muted">{review.sources.find((source) => source.ref === check.ref)?.title}</p></li>)}</ul></details> : null}
        </div></section> : null}
        <section className="card"><div className="card-header"><span className="card-title">Completed file</span></div><div className="card-body border-t border-rule space-y-3"><form action={generateTemplateSubmission}><input type="hidden" name="runId" value={runId} /><Button type="submit" className="w-full" disabled={!ready || busy}>{draftArtifact ? "Generate updated form" : "Generate completed form"}</Button></form>{draftArtifact ? <a className="block text-center text-sm font-bold text-brand underline" href={`/api/accreditation/artifacts/${draftArtifact.id}`}>Download last generated {draftArtifact.filename.split(".").pop()?.toUpperCase()}</a> : null}<p className="text-xs leading-relaxed text-muted">Generation creates a downloadable draft. Review and archive it separately when it is ready.</p></div></section>
        <form action={clearTemplateConversation}><input type="hidden" name="runId" value={runId} /><button className="text-xs font-bold text-muted hover:text-warn" type="submit" disabled={busy}>Clear conversation</button></form>
      </aside>
    </div>
  );
}
