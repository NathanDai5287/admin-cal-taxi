"use client";

/**
 * The four documents on an order's detail page, reusing DocumentRow — the
 * same shell the live /host/documents step uses. Regeneration replays the
 * exact stored payload rather than rebuilding it from the order's snapshot,
 * so an archived document reproduces byte-for-byte modulo template changes.
 */

import { useState } from "react";
import DocumentRow, { type RowState } from "@/components/host/DocumentRow";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { DOCUMENT_META, DOCUMENT_ORDER } from "@/lib/host-documents";
import { formatDateISO } from "@/lib/host-format";
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
    <div className="space-y-3">
      <p className="text-[12px] text-muted max-w-2xl leading-relaxed">
        Regenerating replays the exact request that produced the original PDF. If the Typst
        templates have changed since this order was saved, the new download&rsquo;s wording may
        differ from the archived original even though every number is identical.
      </p>
      {DOCUMENT_ORDER.map((kind, i) => (
        <DocumentSlot
          key={kind}
          index={i + 1}
          kind={kind}
          doc={latestByKind(order.documents, kind)}
        />
      ))}
    </div>
  );
}

function DocumentSlot({
  index,
  kind,
  doc,
}: {
  index: number;
  kind: DocumentKind;
  doc: OrderDocument | null;
}) {
  const meta = DOCUMENT_META[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const state: RowState = doc
    ? { kind: "generated", number: doc.number }
    : { kind: "waiting", reason: "Never generated" };

  async function onDownload() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { filename } = await generatePdf(meta.endpoint, doc.payload);
      setSuccess(`Downloaded ${filename}`);
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

  // formatDateISO on the UTC date part, not toLocaleDateString: this is a
  // client component, so it also renders during SSR — a timezone-dependent
  // format produces different text on the server than in the browser and
  // trips a hydration mismatch.
  const summary = doc
    ? `${fmtUSDOrDash(doc.amount)} · Generated ${formatDateISO(doc.generatedAt.slice(0, 10))}`
    : undefined;

  return (
    <DocumentRow
      index={index}
      kind={kind}
      label={meta.label}
      subtitle={meta.subtitle}
      state={state}
      summary={summary}
      onDownload={onDownload}
      downloadLabel={doc ? "Regenerate PDF" : "Not generated"}
      busy={busy}
      error={error}
      success={success}
    />
  );
}
