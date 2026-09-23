"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES,
  isSupportedChatAttachment,
  locatorLabel,
} from "@/lib/accreditation/chat";
import {
  deleteAccreditationAskChat,
  loadAccreditationAskChat,
  type AccreditationChatResult,
  type AccreditationAskChatSummary,
  type AccreditationAskChatTurn,
  type AccreditationChatSource,
} from "./actions";
import { AnswerMarkdown } from "./answer-markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachmentNames?: string[];
  sources?: AccreditationChatSource[];
  policyUsed?: boolean;
  policyDate?: string;
  streaming?: boolean;
};

const suggestions = [
  "What evidence should I gather for the annual report?",
  "Summarize the document I attach for accreditation.",
  "Which sources support this report claim?",
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
    <details className="mt-5 rounded-2xl bg-canvas/70 px-4 py-3 text-xs">
      <summary className="cursor-pointer font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Sources · {sources.length}</summary>
      <ol className="mt-3 list-decimal space-y-3 border-t border-rule/70 pt-3 pl-5">
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
              {source.excerpts?.length ? <ul className="mt-2 space-y-2">
                {source.excerpts.map((excerpt, index) => <li key={`${source.key}:${index}`} className="border-l border-rule pl-2.5">
                  <blockquote className="whitespace-pre-wrap text-ink">“{excerpt.quote}”</blockquote>
                  <span className="mt-1 block text-xs text-muted">{locatorLabel(excerpt.locator)}</span>
                </li>)}
              </ul> : null}
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

  useEffect(() => { end.current?.scrollIntoView({ behavior: pending || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); }, [messages, pending]);

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
      const streamAnswerId = `${userMessageId}:stream`;
      let result: AccreditationChatResult | undefined;
      const appendDelta = (delta: string) => {
        if (!delta) return;
        setMessages((current) => {
          const existing = current.find((message) => message.id === streamAnswerId);
          if (existing) return current.map((message) => message.id === streamAnswerId ? { ...message, content: message.content + delta } : message);
          return [...current, { id: streamAnswerId, role: "assistant", content: delta, streaming: true }];
        });
      };
      try {
        const response = await fetch("/api/accreditation/ask/stream", { method: "POST", body: form });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error ?? "The assistant could not answer right now. Please try again.");
        }
        if (!response.body) throw new Error("The assistant could not answer right now. Please try again.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handleEvent = (frame: string) => {
          let event = "message";
          const data: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (!data.length) return;
          const payload = JSON.parse(data.join("\n")) as { text?: string; error?: string } & AccreditationChatResult;
          if (event === "delta" && typeof payload.text === "string") appendDelta(payload.text);
          else if (event === "error") throw new Error(payload.error ?? "The assistant could not answer right now. Please try again.");
          else if (event === "done") result = payload;
        };

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            handleEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
          }
          if (done) break;
        }
        if (buffer.trim()) handleEvent(buffer);
      } catch (streamError) {
        setMessages((current) => current.filter((message) => message.id !== userMessageId && message.id !== streamAnswerId));
        setError(streamError instanceof Error ? streamError.message : "The assistant could not answer right now. Please try again.");
        return;
      }
      const finalResult = result as AccreditationChatResult | undefined;
      if (!finalResult || finalResult.error || !finalResult.answer || !finalResult.chatId || !finalResult.turnId || !finalResult.turnNumber || !finalResult.updatedAt) {
        setMessages((current) => current.filter((message) => message.id !== userMessageId && message.id !== streamAnswerId));
        setError(finalResult?.error ?? "The assistant did not save its answer. Please try again.");
        return;
      }

      const savedChatId = finalResult.chatId;
      const savedTitle = finalResult.chatTitle ?? content.slice(0, 120);
      const savedUpdatedAt = finalResult.updatedAt;
      setChatId(savedChatId);
      setChatTitle(savedTitle);
      const savedAnswer: Message = {
        id: `${finalResult.turnId}:answer`,
        role: "assistant",
        content: finalResult.answer,
        sources: finalResult.sources,
        policyUsed: finalResult.policyUsed,
        policyDate: finalResult.policyDate,
      };
      setMessages((current) => current.some((message) => message.id === streamAnswerId)
        ? current.map((message) => message.id === streamAnswerId ? savedAnswer : message)
        : [...current, savedAnswer]);
      setChats((current) => {
        const existing = current.find((chat) => chat.id === savedChatId);
        const saved = {
          id: savedChatId,
          title: finalResult.chatTitle ?? existing?.title ?? savedTitle,
          updatedAt: savedUpdatedAt,
        };
        return [saved, ...current.filter((chat) => chat.id !== savedChatId)]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
    });
  }

  return (
    <section className="ask-policy-panel grid h-[calc(100dvh-198px)] min-h-[620px] grid-rows-[144px_minmax(0,1fr)] overflow-hidden md:h-[calc(100dvh-187px)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[270px_minmax(0,1fr)]" aria-label="Ask Policy chat">
      <aside className="flex min-h-0 flex-col border-b border-rule/70 bg-canvas/50 md:border-b-0 md:border-r md:border-rule/70" aria-label="Saved chats">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-sm font-semibold text-ink">Your chats</h2>
          <button type="button" onClick={newChat} disabled={pending || Boolean(busyChatId)} className="bg-brand-light px-3 py-2 text-xs font-semibold text-brand transition-colors hover:bg-brand/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40">New chat</button>
        </div>
        <div className="ask-policy-scroll flex-1 overflow-y-auto px-2 pb-3 pt-1 sm:px-3">
          {chats.length ? (
            <ul className="space-y-1">
              {chats.map((chat) => (
                <li key={chat.id} className="group flex items-center gap-1">
                  <button type="button" onClick={() => openChat(chat.id)} disabled={pending || Boolean(busyChatId)} aria-pressed={chat.id === chatId} className={`min-w-0 flex-1 px-3 py-2.5 text-left text-sm leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand disabled:opacity-50 ${chat.id === chatId ? "bg-brand-light text-brand" : "text-ink hover:bg-surface"}`}>
                    <span className="block truncate font-semibold">{chat.title}</span>
                    {busyChatId === chat.id ? <span className="mt-0.5 block text-xs text-muted">Opening…</span> : null}
                  </button>
                  <button type="button" onClick={() => deleteChat(chat.id)} disabled={pending || Boolean(busyChatId)} className="shrink-0 px-2 py-2 text-xs font-medium text-muted hover:bg-warn-light hover:text-warn focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand disabled:opacity-40" aria-label={`Delete ${chat.title}`}>Delete</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-3 text-xs leading-5 text-muted">Your saved chats will appear here.</p>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex min-h-[60px] items-center justify-between gap-4 border-b border-rule/60 px-5 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink"><span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden="true" /><span className="truncate">{chatTitle || "New conversation"}</span></div>
          {chatId ? <button type="button" onClick={() => deleteChat(chatId)} disabled={pending || Boolean(busyChatId)} className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted hover:bg-warn-light hover:text-warn disabled:opacity-40">Delete chat</button> : null}
        </div>

        <div className="ask-policy-scroll min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-7 sm:px-8 sm:py-9" aria-live="polite" aria-busy={Boolean(busyChatId)}>
          {!messages.length ? (
            <div className="mx-auto flex min-h-[350px] max-w-2xl flex-col items-center justify-center text-center">
              {busyChatId ? <p className="text-sm text-muted">Loading chat…</p> : <>
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-brand-light text-xl font-semibold text-brand" aria-hidden="true">A</div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">What are you working on?</h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">Ask about accreditation guidance and evidence, or attach a document for this conversation. Create official files through the submissions workspace.</p>
                <div className="mt-8 grid w-full gap-2 sm:grid-cols-3">
                  {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setInput(suggestion); textarea.current?.focus(); }} className="min-h-20 border border-rule bg-canvas/60 px-4 py-3 text-left text-xs leading-relaxed text-ink transition-colors hover:border-brand hover:bg-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{suggestion}</button>)}
                </div>
              </>}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8">
              {messages.map((message) => (
                <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" ? <span className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-light text-xs font-semibold text-brand" aria-hidden="true">A</span> : null}
                  <div className={`min-w-0 max-w-[90%] break-words text-sm leading-6 sm:max-w-[78%] ${message.role === "user" ? "rounded-[22px] rounded-br-md bg-action px-5 py-3.5 text-white" : "pt-1 text-ink"}`}>
                    {message.role === "assistant" ? <AnswerMarkdown answer={message.content} streaming={message.streaming} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                    {message.attachmentNames?.length ? <p className="mt-3 border-t border-white/30 pt-2 text-xs text-white/80">Attached: {message.attachmentNames.join(", ")}</p> : null}
                    {message.role === "assistant" && message.policyUsed ? <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Policy and accreditation sources checked{message.policyDate ? ` for ${message.policyDate}` : ""}</p> : null}
                    {message.role === "assistant" ? <CitationList sources={message.sources ?? []} date={message.policyDate} /> : null}
                  </div>
                </article>
              ))}
              {pending ? <div className="flex items-center gap-3 text-sm text-muted" role="status"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-light text-xs font-semibold text-brand" aria-hidden="true">A</span><span>Thinking…</span></div> : null}
              <div ref={end} />
            </div>
          )}
        </div>

        <div className="bg-surface px-4 pb-5 pt-3 sm:px-8 sm:pb-6">
          <div className="mx-auto max-w-3xl">
            {attachments.length ? <div className="mb-3 flex flex-wrap gap-2" aria-label="Temporary chat attachments">{attachments.map((file, index) => <span key={`${file.name}:${file.lastModified}`} className="inline-flex items-center gap-2 rounded-full bg-brand-light px-3 py-1.5 text-xs text-brand"><span className="max-w-[220px] truncate">{file.name}</span><button type="button" onClick={() => removeAttachment(index)} disabled={pending || Boolean(busyChatId)} className="px-1 text-xs font-bold hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={`Remove ${file.name}`}>×</button></span>)}</div> : null}
            {error ? <p role="alert" className="form-message mb-3">{error}</p> : null}
            <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="ask-policy-composer flex items-end gap-2 p-2">
              <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.txt,.md,.csv,.json" className="sr-only" disabled={pending || Boolean(busyChatId)} onChange={(event) => { addAttachments(Array.from(event.target.files ?? [])); event.target.value = ""; }} tabIndex={-1} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={pending || Boolean(busyChatId)} className="flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:bg-canvas hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40" aria-label="Attach files or images" title="Attach files or images"><PaperclipIcon /></button>
              <textarea ref={textarea} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} disabled={pending || Boolean(busyChatId)} rows={1} maxLength={4000} placeholder="Ask about accreditation…" className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted" aria-label="Message" />
              <button type="submit" disabled={pending || Boolean(busyChatId) || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center bg-action text-white transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><SendIcon /></button>
            </form>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">Chats are saved to your account. Attachments are temporary; use Add evidence to store a source. <Link href="/accreditation" className="font-semibold text-brand underline underline-offset-2">Create documents</Link></p>
          </div>
        </div>
      </div>
    </section>
  );
}
