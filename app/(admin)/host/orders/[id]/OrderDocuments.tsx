"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import DocumentRow from "@/components/host/DocumentRow";
import DocumentsSection from "@/components/host/DocumentsSection";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { DOCUMENT_META, DOCUMENT_ORDER } from "@/lib/host-documents";
import { addDaysIso, formatDateISO } from "@/lib/host-format";
import type { DocumentKind, Order, OrderDocument } from "@/lib/host-orders-types";
import ContractPanel from "../../documents/ContractPanel";
import PaymentMessagePanel from "../../documents/PaymentMessagePanel";
import { fmtUSD } from "../order-format";
import WorkspaceActions from "./WorkspaceActions";

function latestByKind(documents: OrderDocument[], kind: DocumentKind): OrderDocument | null {
  const matches = documents.filter(d => d.kind === kind);
  return matches.length ? matches.reduce((a, b) => a.generatedAt >= b.generatedAt ? a : b) : null;
}

function savedDate(value: unknown): string {
  if (typeof value !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/.exec(value);
  if (!match) return "";
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(match[1]) + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
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

export default function OrderDocuments({ order }: { order: Order }) {
  const docs = Object.fromEntries(DOCUMENT_ORDER.map(kind => [kind, latestByKind(order.documents, kind)])) as Record<DocumentKind, OrderDocument | null>;
  const [busy, setBusy] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string>>>({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [downloadAllReport, setDownloadAllReport] = useState<string | null>(null);

  async function download(kind: DocumentKind): Promise<boolean> {
    const doc = docs[kind];
    if (!doc) return false;
    setBusy(previous => ({ ...previous, [kind]: true }));
    setErrors(previous => ({ ...previous, [kind]: "" }));
    try {
      await generatePdf(DOCUMENT_META[kind].endpoint, doc.payload);
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
      if (docs[kind]) return true;
      missing.push(DOCUMENT_META[kind].label);
      return false;
    });
    const results = await Promise.all(available.map(download));
    available.forEach((kind, index) => {
      if (results[index]) succeeded += 1;
      else failed.push(DOCUMENT_META[kind].label);
    });
    setDownloadAllReport([
      succeeded ? `${succeeded} downloaded` : "",
      missing.length ? `not generated: ${missing.join(", ")}` : "",
      failed.length ? `failed: ${failed.join(", ")}` : "",
    ].filter(Boolean).join(" · ") || "Nothing to download.");
    setDownloadAllBusy(false);
  }

  const depositDueDate = savedDate(docs.deposit_invoice?.payload.due_date) || addDaysIso(order.eventDate, -7);
  const rentalDueDate = savedDate(docs.rental_invoice?.payload.due_date) || addDaysIso(order.eventDate, 2);

  return (
    <DocumentsSection
      actions={<>
        <div className="flex flex-nowrap items-center gap-3">
          <Button type="button" onClick={downloadAll} disabled={downloadAllBusy || !order.documents.length} variant="secondary" compact className="min-w-0 flex-1 sm:flex-none">
            {downloadAllBusy ? "Downloading…" : "Download All"}
          </Button>
          <WorkspaceActions order={order} loadLabel="Update Order" showDuplicate={false} compact />
          <span className="ml-auto hidden sm:inline text-[12px] text-muted whitespace-nowrap">Order: <span className="font-mono">{order.id}</span></span>
        </div>
        {downloadAllReport && <p className="text-[12.5px] text-muted">{downloadAllReport}</p>}
      </>}
      paymentMessage={<PaymentMessagePanel
        eventDate={order.eventDate}
        depositDueDate={depositDueDate}
        depositAmount={String(docs.deposit_invoice?.amount ?? order.depositAmount ?? "")}
        rentalDueDate={rentalDueDate}
        rentalAmount={docs.rental_invoice?.amount ?? order.rentalPrice ?? 0}
        refundAmount={docs.credit_memo?.amount ?? undefined}
      />}
    >
      {DOCUMENT_ORDER.map((kind, index) => {
        const doc = docs[kind];
        return <DocumentRow
          key={kind}
          index={index + 1}
          kind={kind}
          label={DOCUMENT_META[kind].label}
          subtitle={DOCUMENT_META[kind].subtitle}
          state={doc ? { kind: "generated", number: doc.number } : { kind: "unavailable" }}
          summary={rowSummary(kind, doc, order)}
          onDownload={() => { void download(kind); }}
          busy={!!busy[kind]}
          error={errors[kind]}
          downloadLabel="Download PDF"
          downloadVariant="primary"
          fieldsLabel="View fields"
          defaultOpen={kind === "contract" && !!doc}
          inlineFields={kind === "contract"}
          grouped
        >
          {doc && (kind === "contract"
            ? <ContractPanel sign={doc.payload.sign === true} onSignChange={() => {}} readOnly />
            : <SavedFields doc={doc} />)}
        </DocumentRow>;
      })}
    </DocumentsSection>
  );
}
