"use client";

/**
 * The four documents on an order's detail page, as one card of download rows.
 * Downloading replays the exact stored payload rather than rebuilding it from
 * the order's snapshot, so an archived document reproduces byte-for-byte
 * modulo template changes.
 */

import { useState } from "react";
import { Button } from "@/components/brand/button";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { DOCUMENT_META, DOCUMENT_ORDER } from "@/lib/host-documents";
import type { DocumentKind, Order, OrderDocument } from "@/lib/host-orders-types";
import { fmtUSDOrDash } from "../order-format";

/** An order shouldn't normally carry more than one document per kind, but if
 *  it does (e.g. a re-save), show the most recently generated one. */
function latestByKind(documents: OrderDocument[], kind: DocumentKind): OrderDocument | null {
  const matches = documents.filter(d => d.kind === kind);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.generatedAt >= b.generatedAt ? a : b));
}

export default function OrderDocuments({ order }: { order: Order }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Documents</h2>
        <span className="card-subtitle">Download PDFs</span>
      </div>
      <ul className="divide-y divide-rule border-t border-rule">
        {DOCUMENT_ORDER.map(kind => (
          <DocumentLine key={kind} kind={kind} doc={latestByKind(order.documents, kind)} />
        ))}
      </ul>
    </section>
  );
}

function DocumentLine({ kind, doc }: { kind: DocumentKind; doc: OrderDocument | null }) {
  const meta = DOCUMENT_META[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      await generatePdf(meta.endpoint, doc.payload);
    } catch (err) {
      setError(
        err instanceof ApiCallError ? err.message
        : err instanceof Error      ? err.message
        : "request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-4 px-6 py-3" data-document-kind={kind}>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-ink">{meta.label}</p>
        <p className="text-[11.5px] text-muted mt-0.5 tabular-nums">
          {doc ? `${doc.number} · ${fmtUSDOrDash(doc.amount)}` : "Not generated"}
        </p>
        {error && <p className="text-warn text-[12px] mt-1">{error}</p>}
      </div>
      {doc && (
        <Button type="button" compact onClick={onDownload} disabled={busy} className="shrink-0">
          {busy ? "Downloading…" : "↓ Download"}
        </Button>
      )}
    </li>
  );
}
