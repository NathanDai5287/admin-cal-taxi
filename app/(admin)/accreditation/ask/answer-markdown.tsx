"use client";

import dynamic from "next/dynamic";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { safeMarkdownHref } from "@/lib/accreditation/chat-markdown";

const MermaidDiagram = dynamic(() => import("./mermaid-diagram"), {
  ssr: false,
  loading: () => <p className="px-3 py-2 text-xs text-muted" role="status">Rendering diagram…</p>,
});

function markdownComponents(streaming: boolean): Components {
  return {
  a({ href, children }) {
    const safeHref = href ? safeMarkdownHref(href) : "";
    if (!safeHref) return <span>{children}</span>;
    const external = safeHref.startsWith("https://");
    return <a href={safeHref} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="font-medium text-brand underline decoration-brand/50 underline-offset-2 hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{children}</a>;
  },
  img() { return null; },
  h1({ children }) { return <h1 className="mb-3 text-lg font-bold leading-snug">{children}</h1>; },
  h2({ children }) { return <h2 className="mb-2 mt-4 text-base font-bold leading-snug first:mt-0">{children}</h2>; },
  h3({ children }) { return <h3 className="mb-2 mt-4 text-sm font-bold leading-snug first:mt-0">{children}</h3>; },
  p({ children }) { return <p className="mb-3 last:mb-0">{children}</p>; },
  ul({ className, children }) {
    const taskList = className?.split(" ").includes("contains-task-list");
    return <ul className={taskList
      ? "mb-3 list-none space-y-2 pl-0 last:mb-0"
      : "mb-3 list-disc space-y-1 pl-5 last:mb-0 marker:text-brand"}>{children}</ul>;
  },
  ol({ children }) { return <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 marker:font-semibold marker:text-brand">{children}</ol>; },
  li({ className, children }) {
    const taskItem = className?.split(" ").includes("task-list-item");
    return <li className={taskItem ? "relative list-none pl-6" : "pl-0.5"}>{children}</li>;
  },
  input({ type, checked }) {
    if (type !== "checkbox") return null;
    return <span role="img" aria-label={checked ? "Completed task" : "Task to do"} className={`absolute left-0 top-[0.32em] inline-flex h-3.5 w-3.5 items-center justify-center border ${checked ? "border-brand bg-brand text-surface" : "border-brand bg-surface"}`}>
      {checked ? <svg aria-hidden="true" viewBox="0 0 14 14" className="h-3 w-3 fill-none stroke-current" strokeWidth="2"><path d="m2.5 7 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
    </span>;
  },
  blockquote({ children }) { return <blockquote className="my-3 border-l border-brand/60 pl-3 text-muted">{children}</blockquote>; },
  hr() { return <hr className="my-4 border-rule" />; },
  table({ children }) { return <div className="mb-3 max-w-full overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>; },
  thead({ children }) { return <thead className="bg-canvas text-ink">{children}</thead>; },
  th({ children }) { return <th className="border border-rule px-2.5 py-2 font-bold">{children}</th>; },
  td({ children }) { return <td className="border border-rule px-2.5 py-2 align-top">{children}</td>; },
  pre({ children }) { return <div className="mb-3 max-w-full overflow-x-auto last:mb-0">{children}</div>; },
  code({ className, children }) {
    const language = /(?:^|\s)language-([\w-]+)/.exec(className ?? "")?.[1]?.toLowerCase();
    const value = String(children).replace(/\n$/, "");
    if (language === "mermaid" && !streaming) return <MermaidDiagram source={value} />;
    if (className) return <code className="block min-w-max rounded-sm bg-canvas px-3 py-2 font-mono text-xs leading-relaxed text-ink">{children}</code>;
    return <code className="rounded-sm bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>;
  },
  };
}

export function AnswerMarkdown({ answer, streaming = false }: { answer: string; streaming?: boolean }) {
  return (
    <div className="min-w-0 break-words text-sm leading-6 text-ink [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        urlTransform={safeMarkdownHref}
        components={markdownComponents(streaming)}
      >
        {answer}
      </ReactMarkdown>
    </div>
  );
}
