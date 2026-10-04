"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import DocumentRow, { type RowState } from "@/components/host/DocumentRow";
import DocumentsSection from "@/components/host/DocumentsSection";
import { ApiCallError, downloadPdf, fetchStoredPdf, fetchGeneratedPdf, type PdfFile } from "@/lib/host-api";
import { DOCUMENT_META, DOCUMENT_ORDER } from "@/lib/host-documents";
import { addDaysIso, formatDateISO } from "@/lib/host-format";
import { defaultDocuments } from "@/lib/host-order-documents";
import { contractDownload, type StoredContractDownload } from "@/lib/host-contract-download";
import type { DocumentKind, Order, OrderDocument } from "@/lib/host-orders-types";
import type { SigningRevision } from "@/lib/host-signing";
import PaymentMessagePanel from "../../documents/PaymentMessagePanel";
import { fmtUSD } from "../order-format";
import OrderSigning from "./OrderSigning";
import { listSigningAction } from "../../documents/signing-actions";


function latestByKind(documents: OrderDocument[], kind: DocumentKind): OrderDocument | null {
  const matches = documents.filter(d => d.kind === kind && !d.stale && d.sourceSnapshot);
  return matches.length ? matches.reduce((a, b) => a.generatedAt >= b.generatedAt ? a : b) : null;
}

function field(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

function SavedFields({ doc }: { doc: OrderDocument }) {
  const p = doc.payload;
  const details = doc.kind === "credit_memo"
    ? [["Number", doc.number], ["Issue date", field(p.issue_date)], ["Original invoice", field(p.original_invoice)], ["Refund method", field(p.refund_method)]]
    : [["Number", doc.number], ["Issue date", field(p.issue_date)], ["Due date", field(p.due_date)]];
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-[13px]">
      {details.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="font-medium text-ink tabular-nums">{value}</dd>
        </div>
      ))}
      {doc.kind === "rental_invoice" && Array.isArray(p.line_items) && (
        <div className="sm:col-span-2">
          <dt className="text-muted mb-1">Line items</dt>
          <dd className="space-y-1">
            {p.line_items.map((item, index) => {
              const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return <div key={index} className="flex justify-between gap-4"><span>{field(row.description)}</span><span className="tabular-nums">{typeof row.amount === "number" ? fmtUSD(row.amount) : "—"}</span></div>;
            })}
          </dd>
        </div>
      )}
    </dl>
  );
}

function rowSummary(kind: DocumentKind, doc: OrderDocument | null, order: Order): string | undefined {
  if (!doc) return undefined;
  if (kind === "contract") return [
    order.rentalPrice !== null && `${fmtUSD(order.rentalPrice)} fee`,
    order.depositAmount !== null && `${fmtUSD(order.depositAmount)} deposit`,
    formatDateISO(order.eventDate),
  ].filter(Boolean).join(" · ");
  const amount = doc.amount === null ? "" : fmtUSD(doc.amount);
  const due = kind === "credit_memo" ? "" : field(doc.payload.due_date);
  return [amount, due && due !== "—" ? `due ${due}` : ""].filter(Boolean).join(" · ") || doc.number;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiCallError ? err.message : err instanceof Error ? err.message : "request failed";
}

export default function OrderDocuments({ order, signingContract = null, signingLookupFailed = false, signingRevisions, showSigning = true }: {
  order: Order;
  signingContract?: StoredContractDownload | null;
  signingLookupFailed?: boolean;
  signingRevisions?: SigningRevision[];
  showSigning?: boolean;
}) {
  const docs = Object.fromEntries(DOCUMENT_ORDER.map(kind => [kind, latestByKind(order.documents, kind)])) as Record<DocumentKind, OrderDocument | null>;
  const defaults = defaultDocuments(order, docs.deposit_invoice?.number);
  const contractSource = JSON.stringify(signingContract);
  const [downloadedContract, setDownloadedContract] = useState<{ source: string; file: StoredContractDownload | null } | null>(null);
  const storedContract = downloadedContract?.source === contractSource ? downloadedContract.file : signingContract;
  const [busy, setBusy] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string>>>({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [downloadAllReport, setDownloadAllReport] = useState<string | null>(null);

  function stateFor(kind: DocumentKind): RowState {
    if (kind === "contract") {
      if (signingLookupFailed) return { kind: "waiting", reason: "Could not verify stored contracts. Reload before downloading." };
      if (storedContract) return { kind: "generated", number: `Revision ${storedContract.revision}`, detail: storedContract.state === "signed" ? "Signed" : storedContract.state.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()) };
    }
    const doc = docs[kind];
    if (doc) return { kind: "generated", number: doc.number };
    const missing = defaults.missing[kind];
    return missing.length ? { kind: "blocked", missing } : { kind: "ready" };
  }

  async function download(kind: DocumentKind, requests = new Map<DocumentKind, Promise<PdfFile>>()): Promise<boolean> {
    const doc = docs[kind];
    const state = stateFor(kind);
    if (state.kind === "blocked" || state.kind === "waiting") return false;
    setBusy(previous => ({ ...previous, [kind]: true }));
    setErrors(previous => ({ ...previous, [kind]: "" }));
    try {
      async function requestPdf(requestKind: DocumentKind): Promise<PdfFile> {
        const cached = requests.get(requestKind);
        if (cached) return cached;
        const pending = (async () => {
          if (requestKind !== "contract") return fetchGeneratedPdf(DOCUMENT_META[requestKind].endpoint, docs[requestKind]?.payload ?? defaults.payloads[requestKind]);
          // Signing may have completed or changed since this page was loaded.
          const current = contractDownload(await listSigningAction(order.id));
          if (!current && storedContract) throw new Error("Signing history changed. Reload this order before downloading its contract.");
          setDownloadedContract({ source: contractSource, file: current });
          if (current) {
            return fetchStoredPdf(`/api/host/signing/files/${encodeURIComponent(order.id)}/${encodeURIComponent(current.revisionId)}/${current.kind}`);
          }
          return fetchGeneratedPdf(DOCUMENT_META.contract.endpoint, docs.contract?.payload ?? defaults.payloads.contract);
        })();
        requests.set(requestKind, pending);
        return pending;
      }
      // Prepare the referenced invoice automatically, sharing its request with
      // Download All. The memo is downloaded only if both PDFs succeed.
      const [file] = await Promise.all([
        requestPdf(kind),
        kind === "credit_memo" && !doc && !docs.deposit_invoice ? requestPdf("deposit_invoice") : Promise.resolve(),
      ]);
      downloadPdf(file);
      return true;
    } catch (err) {
      setErrors(previous => ({ ...previous, [kind]: errorMessage(err) }));
      return false;
    } finally {
      setBusy(previous => ({ ...previous, [kind]: false }));
    }
  }

  async function downloadAll() {
    setDownloadAllBusy(true);
    setDownloadAllReport(null);
    let succeeded = 0;
    const failed: string[] = [];
    const missing: string[] = [];
    const available = DOCUMENT_ORDER.filter(kind => {
      const state = stateFor(kind);
      if (state.kind === "generated" || state.kind === "ready") return true;
      missing.push(DOCUMENT_META[kind].label);
      return false;
    });
    const requests = new Map<DocumentKind, Promise<PdfFile>>();
    const results = await Promise.all(available.map(kind => download(kind, requests)));
    available.forEach((kind, index) => {
      if (results[index]) succeeded += 1;
      else failed.push(DOCUMENT_META[kind].label);
    });
    setDownloadAllReport([
      succeeded ? `${succeeded} downloaded` : "",
      missing.length ? `not ready: ${missing.join(", ")}` : "",
      failed.length ? `failed: ${failed.join(", ")}` : "",
    ].filter(Boolean).join(" · ") || "Nothing to download.");
    setDownloadAllBusy(false);
  }


  return (
    <DocumentsSection
      actions={<>
        <div className="flex flex-nowrap items-center gap-3">
          <Button type="button" onClick={downloadAll} disabled={downloadAllBusy} variant="secondary" compact className="min-w-0 flex-1 sm:flex-none">
            {downloadAllBusy ? "Downloading…" : "Download All"}
          </Button>
          <span className="ml-auto hidden sm:inline text-[12px] text-muted whitespace-nowrap">Order: <span className="font-mono">{order.id}</span></span>
        </div>
        {downloadAllReport && <p className="text-[12.5px] text-muted">{downloadAllReport}</p>}
      </>}
      contract={<>
        <DocumentRow index={1} kind="contract" label="Hosting Contract" subtitle={storedContract?.previousSigned ? "Previous signed agreement; current replacement below" : "Current agreement and signing progress"} state={stateFor("contract")} summary={storedContract ? `${storedContract.kind === "completed" ? "Signed contract" : "Stored original"} · revision ${storedContract.revision}` : `${fmtUSD(order.rentalPrice ?? 0)} fee · ${formatDateISO(order.eventDate)}`} onDownload={() => { void download("contract"); }} busy={!!busy.contract} error={errors.contract} downloadLabel={storedContract?.previousSigned ? "Previous signed PDF" : storedContract?.kind === "completed" ? "Download signed PDF" : "Download PDF"} downloadVariant="secondary" grouped />
        {showSigning && <OrderSigning key={order.id} order={order} revisions={signingRevisions} />}
      </>}
      paymentMessage={<PaymentMessagePanel
        eventDate={order.eventDate}
        depositAmount={String(order.depositAmount ?? "")}
        rentalAmount={Number(order.rentalPrice ?? 0)}
      />}
    >
      {DOCUMENT_ORDER.filter(kind => kind !== "contract").map((kind, index) => {
        const doc = docs[kind];
        return <DocumentRow
          key={kind}
          index={index + 2}
          kind={kind}
          label={DOCUMENT_META[kind].label}
          subtitle={DOCUMENT_META[kind].subtitle}
          state={stateFor(kind)}
          summary={rowSummary(kind, doc, order) ?? (kind === "credit_memo" ? fmtUSD(order.depositAmount ?? 0)
            : `${fmtUSD(kind === "deposit_invoice" ? order.depositAmount ?? 0 : order.rentalPrice ?? 0)} · due ${formatDateISO(addDaysIso(order.eventDate, kind === "deposit_invoice" ? -7 : 2))}`)}
          onDownload={() => { void download(kind); }}
          busy={!!busy[kind]}
          error={errors[kind]}
          downloadLabel="Download PDF"
          downloadVariant="secondary"
          fieldsLabel="View fields"
          grouped
        >
          {doc ? <SavedFields doc={doc} /> : <p className="text-[13px] text-muted">Generated from this order’s saved details. Select Edit order to customize invoice fields.</p>}
        </DocumentRow>;
      })}
    </DocumentsSection>
  );
}
