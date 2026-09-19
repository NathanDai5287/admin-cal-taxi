"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES,
  isSupportedChatAttachment,
  locatorLabel,
} from "@/lib/accreditation/chat";
import { askAccreditationChat, type AccreditationChatSource } from "./actions";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachmentNames?: string[];
  sources?: AccreditationChatSource[];
  followUps?: string[];
  policyUsed?: boolean;
  policyDate?: string;
};

const suggestions = [
  "What published rules apply to hosting an event off campus?",
  "Summarize the document I attach and flag anything I should review.",
  "What information should I gather before starting the annual report?",
];

function PaperclipIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-9.1 9.1a5.1 5.1 0 0 1-7.2-7.2l9-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SendIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><path d="m4 4 16 8-16 8 3-8-3-8Z" strokeLinejoin="round" /><path d="M7 12h13" strokeLinecap="round" /></svg>;
}

function SourceList({ sources, date }: { sources: AccreditationChatSource[]; date?: string }) {
  if (!sources.length) return null;
  return (
    <details className="mt-4 border-t border-rule pt-3">
      <summary className="cursor-pointer text-xs font-bold text-brand">{sources.length} source {sources.length === 1 ? "passage" : "passages"}</summary>
      <ol className="mt-3 space-y-3">
        {sources.map((source, index) => {
          const locator = locatorLabel(source.locator);
          const label = `${source.title}${source.subtitle ? ` · ${source.subtitle}` : ""}${locator ? ` · ${locator}` : ""}`;
          const href = source.kind === "policy" && source.sourceId
            ? `/api/policy/sources/${source.sourceId}${date ? `?date=${encodeURIComponent(date)}` : ""}${source.locator.page ? `#page=${source.locator.page}` : ""}`
            : null;
          return (
            <li key={`${source.ref}:${index}`} className="text-xs leading-relaxed text-muted">
              <blockquote className="border-l-2 border-rule pl-3 text-ink">“{source.quote}”</blockquote>
              {href ? <a className="mt-1 block text-brand underline" href={href}>{label}</a> : <p className="mt-1">{label}</p>}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function PolicyChat() {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, pending]);

  function addAttachments(incoming: File[]) {
    const next = [...attachments];
    for (const file of incoming) {
      if (!isSupportedChatAttachment(file.name)) { setError(`${file.name} is not a supported file type.`); continue; }
      if (!file.size || file.size > MAX_CHAT_ATTACHMENT_BYTES) { setError(`${file.name} must be 8 MB or smaller.`); continue; }
      if (!next.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) next.push(file);
    }
    if (next.length > MAX_CHAT_ATTACHMENTS) { setError(`You can keep up to ${MAX_CHAT_ATTACHMENTS} attachments in a chat.`); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_CHAT_ATTACHMENT_TOTAL_BYTES) { setError("Attachments must total 20 MB or less."); return; }
    setError("");
    setAttachments(next);
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearChat() {
    if (pending) return;
    setMessages([]);
    setAttachments([]);
    setInput("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    textarea.current?.focus();
  }

  function submit(messageText = input) {
    const content = messageText.trim();
    if (!content || pending) return;
    const history = messages.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      attachmentNames: attachments.length ? attachments.map((file) => file.name) : undefined,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError("");

    startTransition(async () => {
      const form = new FormData();
      form.set("message", content);
      form.set("history", JSON.stringify(history));
      attachments.forEach((file) => form.append("attachments", file));
      const result = await askAccreditationChat(form);
      if (result.error || !result.answer) {
        setError(result.error ?? "The assistant did not return an answer.");
        return;
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer!,
        sources: result.sources,
        followUps: result.followUps,
        policyUsed: result.policyUsed,
        policyDate: result.policyDate,
      }]);
    });
  }

  return (
    <section className="card flex min-h-[650px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 bg-ok" aria-hidden="true" />Ready to help</div>
        <button type="button" onClick={clearChat} disabled={pending || (!messages.length && !attachments.length)} className="text-xs font-bold text-muted hover:text-ink disabled:opacity-40">Clear chat</button>
      </div>

      <div className="flex-1 overflow-y-auto bg-canvas/50 px-4 py-6 sm:px-8" aria-live="polite">
        {!messages.length ? (
          <div className="mx-auto flex min-h-[360px] max-w-2xl flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-brand bg-brand-light text-xl font-bold text-brand" aria-hidden="true">A</div>
            <h2 className="mt-5 text-xl font-bold">How can I help?</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">I can search published policy when your question calls for it, or work from documents and images you attach for this chat.</p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
              {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setInput(suggestion); textarea.current?.focus(); }} className="border border-rule bg-surface p-3 text-left text-xs leading-relaxed text-muted transition-colors hover:border-brand hover:text-ink">{suggestion}</button>)}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] border px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${message.role === "user" ? "border-brand bg-brand text-white" : "border-rule bg-surface text-ink"}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.attachmentNames?.length ? <p className="mt-3 border-t border-white/30 pt-2 text-xs text-white/80">Attached: {message.attachmentNames.join(", ")}</p> : null}
                  {message.role === "assistant" && message.policyUsed ? <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">Published policy checked{message.policyDate ? ` for ${message.policyDate}` : ""}</p> : null}
                  {message.role === "assistant" ? <SourceList sources={message.sources ?? []} date={message.policyDate} /> : null}
                  {message.role === "assistant" && message.followUps?.length ? <div className="mt-4 flex flex-wrap gap-2">{message.followUps.map((followUp) => <button key={followUp} type="button" onClick={() => { setInput(followUp); textarea.current?.focus(); }} className="border border-rule px-2.5 py-1.5 text-left text-xs text-brand hover:bg-brand-light">{followUp}</button>)}</div> : null}
                </div>
              </article>
            ))}
            {pending ? <div className="flex justify-start"><div className="border border-rule bg-surface px-4 py-3 text-sm text-muted"><span className="inline-flex gap-1" aria-label="Assistant is thinking"><span className="animate-pulse">●</span><span className="animate-pulse [animation-delay:150ms]">●</span><span className="animate-pulse [animation-delay:300ms]">●</span></span></div></div> : null}
            <div ref={end} />
          </div>
        )}
      </div>

      <div className="border-t border-rule bg-surface p-4 sm:p-5">
        <div className="mx-auto max-w-3xl">
          {attachments.length ? <div className="mb-3 flex flex-wrap gap-2" aria-label="Temporary chat attachments">{attachments.map((file, index) => <span key={`${file.name}:${file.lastModified}`} className="inline-flex items-center gap-2 border border-rule bg-canvas px-2.5 py-1.5 text-xs"><span className="max-w-[220px] truncate">{file.name}</span><button type="button" onClick={() => removeAttachment(index)} disabled={pending} className="font-bold text-muted hover:text-warn" aria-label={`Remove ${file.name}`}>×</button></span>)}</div> : null}
          {error ? <p role="alert" className="form-message mb-3">{error}</p> : null}
          <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex items-end gap-2 border border-rule bg-surface p-2 focus-within:border-brand">
            <input ref={fileInput} id={inputId} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.txt,.md,.csv,.json" className="sr-only" onChange={(event) => { addAttachments(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            <label htmlFor={inputId} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-muted hover:bg-canvas hover:text-brand" title="Attach files or images"><span className="sr-only">Attach files or images</span><PaperclipIcon /></label>
            <textarea ref={textarea} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} disabled={pending} rows={1} maxLength={4000} placeholder="Ask a question…" className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted" />
            <button type="submit" disabled={pending || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center bg-brand text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><SendIcon /></button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted">Policy answers include retrieved source passages. Verify important decisions with an officer.</p>
        </div>
      </div>
    </section>
  );
}
