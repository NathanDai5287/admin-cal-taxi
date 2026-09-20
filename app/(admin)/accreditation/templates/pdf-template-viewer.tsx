"use client";

import { useState } from "react";

type ViewerKind = "original" | "preview";

export function PdfTemplateViewer({ templateId, previewAvailable }: { templateId: string; previewAvailable: boolean }) {
  const [activeView, setActiveView] = useState<ViewerKind>("original");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const originalUrl = `/api/accreditation/templates/${templateId}?inline=1#toolbar=1&navpanes=0`;
  const previewUrl = `/api/accreditation/templates/${templateId}?kind=preview&inline=1#toolbar=1&navpanes=0`;

  function show(view: ViewerKind) {
    if (view === "preview") setPreviewLoaded(true);
    setActiveView(view);
  }

  return (
    <section className="overflow-hidden rounded border border-rule">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-canvas p-3">
        <div>
          <p className="text-sm font-bold">PDF viewer</p>
          <p className="text-xs text-muted">Review the source and AI-filled preview before activation.</p>
        </div>
        <div aria-label="PDF version" className="flex gap-2 text-xs font-bold" role="tablist">
          <button
            aria-controls={`template-${templateId}-original`}
            aria-selected={activeView === "original"}
            className={`rounded px-3 py-2 ${activeView === "original" ? "bg-brand text-white" : "bg-white text-brand"}`}
            id={`template-${templateId}-original-tab`}
            onClick={() => show("original")}
            role="tab"
            type="button"
          >
            Original
          </button>
          {previewAvailable ? (
            <button
              aria-controls={`template-${templateId}-preview`}
              aria-selected={activeView === "preview"}
              className={`rounded px-3 py-2 ${activeView === "preview" ? "bg-brand text-white" : "bg-white text-brand"}`}
              id={`template-${templateId}-preview-tab`}
              onClick={() => show("preview")}
              role="tab"
              type="button"
            >
              AI preview
            </button>
          ) : null}
        </div>
      </div>
      <div
        aria-labelledby={`template-${templateId}-original-tab`}
        hidden={activeView !== "original"}
        id={`template-${templateId}-original`}
        role="tabpanel"
      >
        <iframe className="block h-[680px] w-full bg-white" src={originalUrl} title="Original PDF template" />
      </div>
      {previewAvailable && previewLoaded ? (
        <div
          aria-labelledby={`template-${templateId}-preview-tab`}
          hidden={activeView !== "preview"}
          id={`template-${templateId}-preview`}
          role="tabpanel"
        >
          <iframe className="block h-[680px] w-full bg-white" src={previewUrl} title="AI preview PDF template" />
        </div>
      ) : null}
    </section>
  );
}
