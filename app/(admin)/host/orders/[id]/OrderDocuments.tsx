"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import DocumentRow, { type RowState } from "@/components/host/DocumentRow";
import DocumentsSection from "@/components/host/DocumentsSection";
import { ApiCallError, downloadStoredPdf, generatePdf } from "@/lib/host-api";
import { DOCUMENT_META, DOCUMENT_ORDER, buildContractPayload, buildDepositPayload, buildRentalPayload, buildCreditMemoPayload, missingFields, mintContractNumber } from "@/lib/host-documents";
import { addDaysIso, formatDateISO, todayIso } from "@/lib/host-format";
import { liveBreakdown } from "@/lib/host-derive";
import { contractDownload, type StoredContractDownload } from "@/lib/host-contract-download";
import type { DocumentKind, Order, OrderDocument } from "@/lib/host-orders-types";
import ContractPanel from "../../documents/ContractPanel";
import PaymentMessagePanel from "../../documents/PaymentMessagePanel";
import { fmtUSD } from "../order-format";
import WorkspaceActions, { sharedStateFromSnapshot } from "./WorkspaceActions";
import OrderSigning from "./OrderSigning";
import { buildLineItems } from "../../documents/build-line-items";
import { listSigningAction } from "../../documents/signing-actions";

/** Missing unsigned PDFs use this order's details, never the Create workspace. */
function defaultDocuments(order: Order, depositNumber?: string) {
  const saved = sharedStateFromSnapshot(order.snapshot);
  const data = {
    ...saved,
    clubs: saved.clubs.length ? saved.clubs : [order.clubName],
    eventDate: order.eventDate,
    finalPrice: String(order.rentalPrice ?? ""),
    depositAmount: String(order.depositAmount ?? ""),
    overrides: { ...saved.overrides, finalPrice: true, depositAmount: true },
  };
  const issueDate = todayIso();
  const originalInvoice = depositNumber || saved.lastDepositInvoiceNumber || "";
  const invoiceNumber = originalInvoice || mintContractNumber(order.clubName, order.eventDate).replace(/^CTR-/, "DEP-");
  const fields = {
    contract: { sign: saved.contractPresign },
    deposit: { amount: data.depositAmount, issueDate, dueDate: addDaysIso(order.eventDate, -7), invoiceNumber },
    rental: { items: buildLineItems(liveBreakdown(data), order.rentalPrice ?? 0, formatDateISO(order.eventDate)), issueDate, dueDate: addDaysIso(order.eventDate, 2), invoiceNumber: "" },
    creditMemo: { amount: data.depositAmount, issueDate, originalInvoice, refundMethod: "", refundDescription: "", memoNumber: "" },
  };
  const payloads = {
    contract: buildContractPayload(data, fields.contract),
    deposit_invoice: buildDepositPayload(data, fields.deposit),
    rental_invoice: buildRentalPayload(data, fields.rental),
    credit_memo: buildCreditMemoPayload(data, fields.creditMemo),
  };
  const missing = Object.fromEntries(DOCUMENT_ORDER.map(kind => [kind,
    kind === "rental_invoice" && (!Number.isFinite(order.rentalPrice) || (order.rentalPrice ?? 0) <= 0)
      ? ["a positive rental fee"]
      : missingFields(kind, data, fields),
  ])) as Record<DocumentKind, string[]>;
  return { payloads, missing };
}

function latestByKind(documents: OrderDocument[], kind: DocumentKind): OrderDocument | null {
  const matches = documents.filter(d => d.kind === kind);
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

export default function OrderDocuments({ order, signingContract = null, signingLookupFailed = false }: {
  order: Order;
  signingContract?: StoredContractDownload | null;
  signingLookupFailed?: boolean;
}) {
  const docs = Object.fromEntries(DOCUMENT_ORDER.map(kind => [kind, latestByKind(order.documents, kind)])) as Record<DocumentKind, OrderDocument | null>;
  const [generatedDepositNumber, setGeneratedDepositNumber] = useState("");
  const defaults = defaultDocuments(order, docs.deposit_invoice?.number ?? generatedDepositNumber);
  const [storedContract, setStoredContract] = useState(signingContract);
  const [busy, setBusy] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string>>>({});
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [downloadAllReport, setDownloadAllReport] = useState<string | null>(null);

  function stateFor(kind: DocumentKind): RowState {
    if (kind === "contract") {
      if (signingLookupFailed) return { kind: "waiting", reason: "Could not verify stored contracts. Reload before downloading." };
      if (storedContract) return { kind: "generated", number: `${storedContract.state.replaceAll("_", " ")} · revision ${storedContract.revision}` };
    }
    const doc = docs[kind];
    if (doc) return { kind: "generated", number: doc.number };
    const missing = defaults.missing[kind];
    return missing.length ? { kind: "blocked", missing } : { kind: "ready" };
  }

  async function download(kind: DocumentKind): Promise<boolean> {
    const doc = docs[kind];
    const state = stateFor(kind);
    if (state.kind === "blocked" || state.kind === "waiting") return false;
    setBusy(previous => ({ ...previous, [kind]: true }));
    setErrors(previous => ({ ...previous, [kind]: "" }));
    try {
      if (kind === "contract") {
        // Signing may have completed or changed since this page was loaded.
        const current = contractDownload(await listSigningAction(order.id));
        if (!current && storedContract) throw new Error("Signing history changed. Reload this order before downloading its contract.");
        setStoredContract(current);
        if (current) {
          await downloadStoredPdf(`/api/host/signing/files/${encodeURIComponent(order.id)}/${encodeURIComponent(current.revisionId)}/${current.kind}`);
        } else {
          await generatePdf(DOCUMENT_META[kind].endpoint, doc?.payload ?? defaults.payloads[kind]);
        }
      } else {
        const { filename } = await generatePdf(DOCUMENT_META[kind].endpoint, doc?.payload ?? defaults.payloads[kind]);
        if (kind === "deposit_invoice") setGeneratedDepositNumber(filename.replace(/\.pdf$/i, ""));
      }
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
    const results = await Promise.all(available.map(download));
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

  const contract = docs.contract?.payload ?? defaults.payloads.contract;

  return (
    <DocumentsSection
      actions={<>
        <div className="flex flex-nowrap items-center gap-3">
          <Button type="button" onClick={downloadAll} disabled={downloadAllBusy} variant="secondary" compact className="min-w-0 flex-1 sm:flex-none">
            {downloadAllBusy ? "Downloading…" : "Download All"}
          </Button>
          <WorkspaceActions order={order} loadLabel="Update Order" showDuplicate={false} compact />
          <span className="ml-auto hidden sm:inline text-[12px] text-muted whitespace-nowrap">Order: <span className="font-mono">{order.id}</span></span>
        </div>
        {downloadAllReport && <p className="text-[12.5px] text-muted">{downloadAllReport}</p>}
      </>}
      paymentMessage={<PaymentMessagePanel
        eventDate={order.eventDate}
        depositAmount={String(contract?.deposit ?? order.depositAmount ?? "")}
        rentalAmount={Number(contract?.price ?? order.rentalPrice ?? 0)}
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
          state={stateFor(kind)}
          summary={kind === "contract" && storedContract
            ? `${storedContract.kind === "completed" ? "Exact completed PDF" : "Exact stored original"} · revision ${storedContract.revision}`
            : rowSummary(kind, doc, order) ?? (kind === "contract"
            ? `${fmtUSD(order.rentalPrice ?? 0)} fee · ${formatDateISO(order.eventDate)}`
            : kind === "credit_memo" ? fmtUSD(order.depositAmount ?? 0)
            : `${fmtUSD(kind === "deposit_invoice" ? order.depositAmount ?? 0 : order.rentalPrice ?? 0)} · due ${formatDateISO(addDaysIso(order.eventDate, kind === "deposit_invoice" ? -7 : 2))}`)}
          onDownload={() => { void download(kind); }}
          busy={!!busy[kind]}
          error={errors[kind]}
          downloadLabel="Download PDF"
          downloadVariant="primary"
          fieldsLabel={kind === "contract" && storedContract ? "About this contract" : "View fields"}
          defaultOpen={kind === "contract" && !!doc}
          inlineFields={kind === "contract"}
          grouped
        >
          {kind === "contract"
            ? storedContract
              ? <p className="text-[13px] text-muted">Review the stored PDF for revision {storedContract.revision}&rsquo;s approved terms and signatures.</p>
              : <ContractPanel sign={contract.sign === true} onSignChange={() => {}} readOnly />
            : doc ? <SavedFields doc={doc} /> : <p className="text-[13px] text-muted">Generated from this order’s saved details. Load the order to customize invoice fields.</p>}
        </DocumentRow>;
      })}
      <OrderSigning key={order.id} order={order} />
    </DocumentsSection>
  );
}
