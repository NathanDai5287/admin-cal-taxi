"use client";

import DOMPurify from "dompurify";
import { useEffect, useId, useState } from "react";

import { isSafeSmallMermaid } from "@/lib/accreditation/chat-markdown";

type DiagramState = { source: string; svg: string } | { source: string; error: true } | null;

export default function MermaidDiagram({ source }: { source: string }) {
  const id = `ask-policy-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [diagram, setDiagram] = useState<DiagramState>(null);

  useEffect(() => {
    let active = true;
    if (!isSafeSmallMermaid(source)) {
      return () => { active = false; };
    }

    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
          htmlLabels: false,
          flowchart: { useMaxWidth: true },
          sequence: { useMaxWidth: true },
        });
        const result = await mermaid.render(id, source);
        if (/<foreignObject\b/i.test(result.svg)) throw new Error("Diagram labels require HTML output");
        const svg = DOMPurify.sanitize(result.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["foreignObject", "iframe", "script"],
          FORBID_ATTR: ["href", "xlink:href", "onload", "onclick"],
          SANITIZE_DOM: true,
        });
        if (!/<svg[\s>]/i.test(svg) || /<foreignObject\b|<script\b/i.test(svg)) throw new Error("Unsafe diagram output");
        if (active) setDiagram({ source, svg });
      } catch {
        if (active) setDiagram({ source, error: true });
      }
    }

    void render();
    return () => { active = false; };
  }, [id, source]);

  if (!isSafeSmallMermaid(source)) {
    return <div className="space-y-2">
      <p className="text-xs text-muted">Diagram unavailable; showing its source.</p>
      <pre className="max-w-full overflow-x-auto rounded-sm bg-canvas px-3 py-2"><code className="font-mono text-xs leading-relaxed text-ink">{source}</code></pre>
    </div>;
  }
  if (!diagram || diagram.source !== source) return <p className="px-3 py-2 text-xs text-muted" role="status">Rendering diagram…</p>;
  if ("error" in diagram) {
    return <div className="space-y-2">
      <p className="text-xs text-muted">Diagram unavailable; showing its source.</p>
      <pre className="max-w-full overflow-x-auto rounded-sm bg-canvas px-3 py-2"><code className="font-mono text-xs leading-relaxed text-ink">{source}</code></pre>
    </div>;
  }
  const diagramLabel = source.trim().startsWith("sequenceDiagram")
    ? "Assistant generated sequence diagram; read the nearby text explanation"
    : "Assistant generated flow diagram; read the nearby text explanation";
  return <div className="max-w-full overflow-x-auto rounded-sm bg-canvas p-2" role="img" aria-label={diagramLabel}>
    <div className="mx-auto min-w-[280px] max-w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: diagram.svg }} />
  </div>;
}
