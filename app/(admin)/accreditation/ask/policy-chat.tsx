"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES,
  isSupportedChatAttachment,
  locatorLabel,
} from "@/lib/accreditation/chat";
import {
  askAccreditationChat,
  deleteAccreditationAskChat,
  loadAccreditationAskChat,
  type AccreditationAskChatSummary,
  type AccreditationAskChatTurn,
  type AccreditationChatSource,
} from "./actions";

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

function CitationList({ sources, date }: { sources: AccreditationChatSource[]; date?: string }) {
  if (!sources.length) return null;
  return (
    <details className="mt-4 border-t border-rule pt-3 text-xs">
      <summary className="cursor-pointer font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Citations ({sources.length})</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        {sources.map((source) => {
          const locators = source.locators.map(locatorLabel).filter(Boolean).join("; ");
          const label = `${source.title}${source.subtitle ? ` · ${source.subtitle}` : ""}`;
          const href = source.kind === "policy" && source.sourceId
            ? `/api/policy/sources/${source.sourceId}${date ? `?date=${encodeURIComponent(date)}` : ""}`
            : source.kind === "accreditation" && source.sourceId
              ? `/api/accreditation/sources/${source.sourceId}`
              : null;
          return (
            <li key={source.key} className="text-xs leading-relaxed text-muted">
              {href ? <a className="text-brand underline underline-offset-2" href={href}>{label}</a> : <span className="text-ink">{label}</span>}
              {locators ? <span> · Cited locations: {locators}</span> : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function messagesFromTurns(turns: AccreditationAskChatTurn[]): Message[] {
  return turns.flatMap((turn) => [
    {
      id: `${turn.id}:question`,
      role: "user" as const,
      content: turn.question,
      attachmentNames: turn.attachmentNames.length ? turn.attachmentNames : undefined,
    },
    {
      id: `${turn.id}:answer`,
      role: "assistant" as const,
      content: turn.answer,
      sources: turn.sources,
      followUps: turn.followUps,
      policyUsed: turn.policyUsed,
      policyDate: turn.policyDate,
    },
  ]);
}

export function PolicyChat({
  initialChats,
  initialError,
}: {
  initialChats: AccreditationAskChatSummary[];
  initialError?: string;
}) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [chats, setChats] = useState(initialChats);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
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

  function newChat() {
    if (pending || busyChatId) return;
    setChatId(null);
    setChatTitle("");
    setMessages([]);
    setAttachments([]);
    setInput("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    textarea.current?.focus();
  }

  async function openChat(id: string) {
    if (pending || busyChatId || id === chatId) return;
    setBusyChatId(id);
    setError("");
    try {
      const result = await loadAccreditationAskChat(id);
      if (result.error || !result.chat || !result.turns) {
        setError(result.error ?? "That chat could not be opened.");
        return;
      }
      setChatId(result.chat.id);
      setChatTitle(result.chat.title);
      setMessages(messagesFromTurns(result.turns));
      setAttachments([]);
      setInput("");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError("That chat could not be opened. Try again.");
    } finally {
      setBusyChatId(null);
    }
  }

  async function deleteChat(id: string) {
    if (pending || busyChatId) return;
    const title = chats.find((chat) => chat.id === id)?.title ?? "this chat";
    if (!window.confirm(`Delete “${title}” and its messages?`)) return;
    setBusyChatId(id);
    setError("");
    try {
      const result = await deleteAccreditationAskChat(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChats((current) => current.filter((chat) => chat.id !== id));
      if (chatId === id) {
        setChatId(null);
        setChatTitle("");
        setMessages([]);
        setAttachments([]);
        setInput("");
        if (fileInput.current) fileInput.current.value = "";
      }
    } catch {
      setError("That chat could not be deleted. Try again.");
    } finally {
      setBusyChatId(null);
    }
  }

  function submit(messageText = input) {
    const content = messageText.trim();
    if (!content || pending || busyChatId) return;
    const submittedAttachments = [...attachments];
    const userMessageId = crypto.randomUUID();
    setMessages((current) => [...current, {
      id: userMessageId,
      role: "user",
      content,
      attachmentNames: submittedAttachments.length ? submittedAttachments.map((file) => file.name) : undefined,
    }]);
    setInput("");
    setError("");

    startTransition(async () => {
      const form = new FormData();
      form.set("message", content);
      if (chatId) form.set("chatId", chatId);
      submittedAttachments.forEach((file) => form.append("attachments", file));
      let result: Awaited<ReturnType<typeof askAccreditationChat>>;
      try {
        result = await askAccreditationChat(form);
      } catch {
        setMessages((current) => current.filter((message) => message.id !== userMessageId));
        setError("The assistant could not answer right now. Please try again.");
        return;
      }
      if (result.error || !result.answer || !result.chatId || !result.turnId || !result.turnNumber || !result.updatedAt) {
        setMessages((current) => current.filter((message) => message.id !== userMessageId));
        setError(result.error ?? "The assistant did not save its answer. Please try again.");
        return;
      }

      setChatId(result.chatId);
      setChatTitle(result.chatTitle ?? content.slice(0, 120));
      setMessages((current) => [...current, {
        id: `${result.turnId}:answer`,
        role: "assistant",
        content: result.answer!,
        sources: result.sources,
        followUps: result.followUps,
        policyUsed: result.policyUsed,
        policyDate: result.policyDate,
      }]);
      setChats((current) => {
        const existing = current.find((chat) => chat.id === result.chatId);
        const saved = {
          id: result.chatId!,
          title: result.chatTitle ?? existing?.title ?? content.slice(0, 120),
          updatedAt: result.updatedAt!,
        };
        return [saved, ...current.filter((chat) => chat.id !== result.chatId)]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
    });
  }

  return (
    <section className="card grid min-h-[650px] overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex max-h-56 flex-col border-b border-rule bg-canvas/60 md:max-h-none md:border-b-0 md:border-r" aria-label="Saved chats">
        <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Chat history</h2>
          <button type="button" onClick={newChat} disabled={pending || Boolean(busyChatId)} className="border border-rule bg-surface px-2 py-1 text-xs font-bold text-brand hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40">New chat</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {chats.length ? (
            <ul className="space-y-1">
              {chats.map((chat) => (
                <li key={chat.id} className="flex items-start gap-1">
                  <button type="button" onClick={() => openChat(chat.id)} disabled={pending || Boolean(busyChatId)} aria-pressed={chat.id === chatId} className={`min-w-0 flex-1 px-2.5 py-2 text-left text-xs leading-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand disabled:opacity-50 ${chat.id === chatId ? "bg-brand-light text-brand" : "text-ink hover:bg-surface"}`}>
                    <span className="block truncate font-semibold">{chat.title}</span>
                    {busyChatId === chat.id ? <span className="mt-0.5 block text-xs text-muted">Opening…</span> : null}
                  </button>
                  <button type="button" onClick={() => deleteChat(chat.id)} disabled={pending || Boolean(busyChatId)} className="shrink-0 px-1.5 py-2 text-[10px] font-semibold text-muted underline underline-offset-2 hover:text-warn focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand disabled:opacity-40" aria-label={`Delete ${chat.title}`}>Delete</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-3 text-xs leading-5 text-muted">Your saved chats will appear here.</p>
          )}
        </div>
      </aside>

      <div className="flex min-h-[560px] min-w-0 flex-col">
        <div className="flex min-h-[49px] items-center justify-between gap-4 border-b border-rule px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted"><span className="h-2 w-2 shrink-0 bg-ok" aria-hidden="true" /><span className="truncate">{chatTitle || "Ready to help"}</span></div>
          {chatId ? <button type="button" onClick={() => deleteChat(chatId)} disabled={pending || Boolean(busyChatId)} className="shrink-0 text-xs font-bold text-muted underline underline-offset-2 hover:text-warn disabled:opacity-40">Delete chat</button> : null}
        </div>

        <div className="flex-1 overflow-y-auto bg-canvas/50 px-4 py-6 sm:px-8" aria-live="polite" aria-busy={Boolean(busyChatId)}>
          {!messages.length ? (
            <div className="mx-auto flex min-h-[360px] max-w-2xl flex-col items-center justify-center text-center">
              {busyChatId ? <p className="text-sm text-muted">Loading chat…</p> : <>
                <div className="flex h-12 w-12 items-center justify-center border border-brand bg-brand-light text-xl font-bold text-brand" aria-hidden="true">A</div>
                <h2 className="mt-5 text-xl font-bold">How can I help?</h2>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">I can search published policy and accreditation evidence when your question calls for it, or work from documents and images you attach for this chat.</p>
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
                  {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setInput(suggestion); textarea.current?.focus(); }} className="border border-rule bg-surface p-3 text-left text-xs leading-relaxed text-muted transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{suggestion}</button>)}
                </div>
              </>}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] border px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${message.role === "user" ? "border-brand bg-brand text-white" : "border-rule bg-surface text-ink"}`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.attachmentNames?.length ? <p className="mt-3 border-t border-white/30 pt-2 text-xs text-white/80">Attached: {message.attachmentNames.join(", ")}</p> : null}
                    {message.role === "assistant" && message.policyUsed ? <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Policy and accreditation sources checked{message.policyDate ? ` for ${message.policyDate}` : ""}</p> : null}
                    {message.role === "assistant" && message.followUps?.length ? <div className="mt-4 flex flex-wrap gap-2">{message.followUps.map((followUp) => <button key={followUp} type="button" onClick={() => { setInput(followUp); textarea.current?.focus(); }} className="border border-rule px-2.5 py-1.5 text-left text-xs text-brand hover:bg-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{followUp}</button>)}</div> : null}
                    {message.role === "assistant" ? <CitationList sources={message.sources ?? []} date={message.policyDate} /> : null}
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
            {attachments.length ? <div className="mb-3 flex flex-wrap gap-2" aria-label="Temporary chat attachments">{attachments.map((file, index) => <span key={`${file.name}:${file.lastModified}`} className="inline-flex items-center gap-2 border border-rule bg-canvas px-2.5 py-1.5 text-xs"><span className="max-w-[220px] truncate">{file.name}</span><button type="button" onClick={() => removeAttachment(index)} disabled={pending || Boolean(busyChatId)} className="font-bold text-muted hover:text-warn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={`Remove ${file.name}`}>×</button></span>)}</div> : null}
            {error ? <p role="alert" className="form-message mb-3">{error}</p> : null}
            <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex items-end gap-2 border border-rule bg-surface p-2 focus-within:border-brand">
              <input ref={fileInput} id={inputId} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.txt,.md,.csv,.json" className="sr-only" onChange={(event) => { addAttachments(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <label htmlFor={inputId} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-muted hover:bg-canvas hover:text-brand" title="Attach files or images"><span className="sr-only">Attach files or images</span><PaperclipIcon /></label>
              <textarea ref={textarea} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} disabled={pending || Boolean(busyChatId)} rows={1} maxLength={4000} placeholder="Ask a question…" className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted" />
              <button type="submit" disabled={pending || Boolean(busyChatId) || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center bg-brand text-white hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><SendIcon /></button>
            </form>
            <p className="mt-2 text-center text-xs text-muted">Saved chats stay in your account. Attachments are temporary and must be added again in a later session.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
