"use client";

/**
 * Step 4: generate all four documents and (optionally) archive them.
 *
 * Replaces the old per-step generation on /host/contract and /host/invoice —
 * every PDF is now produced here, in one place, against the payload builders
 * in lib/host-documents.ts. Nothing is saved to the order archive until the
 * user explicitly clicks "Save to Orders"; generating a PDF only downloads it
 * and records it in this page's local state for the session.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DocumentRow, { type RowState } from "@/components/host/DocumentRow";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { effective } from "@/lib/host-derive";
import { addDaysIso, formatDateISO, todayIso } from "@/lib/host-format";
import { useSharedData } from "@/lib/host-shared-state";
import {
  DOCUMENT_META,
  DOCUMENT_ORDER,
  buildContractPayload,
  buildCreditMemoPayload,
  buildDepositPayload,
  buildRentalPayload,
  lineItemsTotal,
  missingFields,
  mintContractNumber,
  type CreditMemoFields,
  type DepositFields,
  type RentalFields,
} from "@/lib/host-documents";
import type { DocumentKind, OrderDocument } from "@/lib/host-orders-types";
import { addDocumentAction, saveOrderAction, updateOrderAction } from "@/app/(admin)/host/orders/actions";
import { buildLineItems } from "./build-line-items";
import ContractPanel from "./ContractPanel";
import DepositPanel from "./DepositPanel";
import RentalPanel from "./RentalPanel";
import CreditMemoPanel from "./CreditMemoPanel";

function errorMessage(err: unknown): string {
  return err instanceof ApiCallError ? err.message
    : err instanceof Error ? err.message
    : "request failed";
}

function toNum(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

type GeneratedMap = Partial<Record<DocumentKind, Omit<OrderDocument, "id">>>;

export default function DocumentsPage() {
  const { hydrated, data, update } = useSharedData();

  // ── Per-document local fields ─────────────────────────────────────────────
  const [contractSign, setContractSign] = useState(false);

  const [deposit, setDeposit] = useState<DepositFields>({
    amount: "", issueDate: todayIso(), dueDate: "", invoiceNumber: "",
  });
  const [rental, setRental] = useState<RentalFields>({
    items: [], issueDate: todayIso(), dueDate: "", invoiceNumber: "",
  });
  const [creditMemo, setCreditMemo] = useState<CreditMemoFields>({
    amount: "", issueDate: todayIso(), originalInvoice: "",
    refundMethod: "", refundDescription: "", memoNumber: "",
  });

  // ── Seeding (copied from the old /host/invoice tabs) ──────────────────────

  // Deposit: amount ← effective(depositAmount), due date ← event date.
  const initialDepositAmount = hydrated ? effective(data, "depositAmount") : "";
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydrated && !deposit.amount && initialDepositAmount) {
        setDeposit(f => (f.amount ? f : { ...f, amount: initialDepositAmount }));
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, initialDepositAmount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      if (data.eventDate) {
        setDeposit(f => (f.dueDate ? f : { ...f, dueDate: data.eventDate }));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [hydrated, data.eventDate]);

  // Rental: due date ← event date + 2 days.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      if (data.eventDate) {
        const computed = addDaysIso(data.eventDate, 2);
        if (computed) setRental(f => (f.dueDate ? f : { ...f, dueDate: computed }));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [hydrated, data.eventDate]);

  // Rental: line items ← buildLineItems(pricingBreakdown, negotiated total).
  // Re-derives whenever the source of truth changes; manual edits within a
  // session survive re-renders since `rental.items` isn't in the dep list.
  const rentalTarget = useMemo(() => {
    const finalNum = parseFloat(effective(data, "finalPrice"));
    if (Number.isFinite(finalNum) && finalNum > 0) return finalNum;
    return data.pricingBreakdown?.total ?? 0;
  }, [data]);
  const eventDateReadable = data.eventDate ? formatDateISO(data.eventDate) : "";
  const rentalDerivedKey = `${rentalTarget}|${data.pricingBreakdown?.subtotal ?? "x"}|${eventDateReadable}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      setRental(f => ({ ...f, items: buildLineItems(data.pricingBreakdown, rentalTarget, eventDateReadable) }));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, rentalDerivedKey]);

  function resetRentalFromPricing() {
    setRental(f => ({ ...f, items: buildLineItems(data.pricingBreakdown, rentalTarget, eventDateReadable) }));
  }

  // Credit memo: refund amount seeded once (old CreditMemoForm behavior —
  // freeze at first read so a later pricing change doesn't clobber a manual
  // adjustment).
  const [amountSeeded, setAmountSeeded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydrated && !amountSeeded) {
        setCreditMemo(f => {
          if (f.amount) return f;
          const suggested = effective(data, "depositAmount");
          return suggested ? { ...f, amount: suggested } : f;
        });
        setAmountSeeded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, amountSeeded]);

  // Credit memo: original invoice ← last generated deposit invoice number.
  // Re-runs whenever that number changes (including a deposit invoice
  // generated in this same session), as long as the user hasn't typed one.
  useEffect(() => {
    if (!hydrated) return;
    if (data.lastDepositInvoiceNumber) {
      setCreditMemo(f => (f.originalInvoice ? f : { ...f, originalInvoice: data.lastDepositInvoiceNumber }));
    }
  }, [hydrated, data.lastDepositInvoiceNumber]);

  // ── Generation state ──────────────────────────────────────────────────────

  // `generatedRef` is the read-fresh source of truth for the "has this kind
  // been generated" question — needed because Download All decides, mid-loop,
  // whether the credit memo has just been unblocked by a deposit invoice it
  // generated a moment earlier. Plain state read through a closure would be
  // stale until the next render; the ref never is. `renderTick` just forces
  // the re-render so the UI reflects it.
  const generatedRef = useRef<GeneratedMap>({});
  const [, setRenderTick] = useState(0);

  function recordGenerated(kind: DocumentKind, doc: Omit<OrderDocument, "id">) {
    generatedRef.current = { ...generatedRef.current, [kind]: doc };
    setRenderTick(v => v + 1);
  }

  const generated = generatedRef.current;

  /**
   * Everything generated this session, at most one per kind — regenerating a
   * document supersedes the earlier one rather than adding a second. The
   * archive enforces the same rule (unique index on order_id + kind), because
   * two documents of one kind would double-count in the order's ledger.
   */
  function generatedDocuments(): Omit<OrderDocument, "id">[] {
    return DOCUMENT_ORDER.map(k => generatedRef.current[k]).filter(
      (d): d is Omit<OrderDocument, "id"> => Boolean(d),
    );
  }

  const [busy, setBusy] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string | null>>>({});
  const [successes, setSuccesses] = useState<Partial<Record<DocumentKind, string | null>>>({});

  /** The invoice number to use for the credit memo, resolving around any
   *  in-flight state so generation is correct even if the auto-fill effect
   *  above hasn't re-rendered yet. */
  function resolvedOriginalInvoice(): string {
    return (
      creditMemo.originalInvoice.trim()
      || data.lastDepositInvoiceNumber
      || generatedRef.current.deposit_invoice?.number
      || ""
    );
  }

  function fieldsFor(): Parameters<typeof missingFields>[2] {
    return {
      contract: { sign: contractSign },
      deposit,
      rental,
      creditMemo: { ...creditMemo, originalInvoice: resolvedOriginalInvoice() },
    };
  }

  function statusFor(kind: DocumentKind): RowState {
    const gen = generated[kind];
    if (gen) return { kind: "generated", number: gen.number };

    if (kind === "credit_memo") {
      const hasDepositNumber =
        creditMemo.originalInvoice.trim() !== ""
        || Boolean(data.lastDepositInvoiceNumber)
        || Boolean(generatedRef.current.deposit_invoice);
      if (!hasDepositNumber) {
        return {
          kind: "waiting",
          reason: "Generate the security deposit invoice first — its invoice number is needed here. Or type one in manually below.",
        };
      }
    }

    const missing = missingFields(kind, data, fieldsFor());
    return missing.length ? { kind: "blocked", missing } : { kind: "ready" };
  }

  async function generateDoc(kind: DocumentKind): Promise<boolean> {
    setErrors(e => ({ ...e, [kind]: null }));
    setSuccesses(s => ({ ...s, [kind]: null }));
    setBusy(b => ({ ...b, [kind]: true }));
    try {
      let payload: Record<string, unknown>;
      let amount: number | null;

      switch (kind) {
        case "contract": {
          payload = buildContractPayload(data, { sign: contractSign });
          amount = toNum(effective(data, "rentalPrice"));
          break;
        }
        case "deposit_invoice": {
          payload = buildDepositPayload(data, deposit);
          amount = toNum(deposit.amount);
          break;
        }
        case "rental_invoice": {
          payload = buildRentalPayload(data, rental);
          amount = lineItemsTotal(rental.items);
          break;
        }
        case "credit_memo": {
          const fields: CreditMemoFields = { ...creditMemo, originalInvoice: resolvedOriginalInvoice() };
          payload = buildCreditMemoPayload(data, fields);
          amount = toNum(fields.amount);
          break;
        }
      }

      const { filename } = await generatePdf(DOCUMENT_META[kind].endpoint, payload);
      const number = kind === "contract"
        ? mintContractNumber(data.clubName, data.eventDate)
        : filename.replace(/\.pdf$/i, "");

      const doc: Omit<OrderDocument, "id"> = {
        kind, number, filename, amount,
        generatedAt: new Date().toISOString(),
        payload,
      };

      recordGenerated(kind, doc);
      setSuccesses(s => ({ ...s, [kind]: `Downloaded ${filename}` }));

      // Preserve the cross-reference: the credit memo tab used to read this
      // straight from shared state.
      if (kind === "deposit_invoice") {
        update("lastDepositInvoiceNumber", number);
      }

      return true;
    } catch (err) {
      setErrors(e => ({ ...e, [kind]: errorMessage(err) }));
      return false;
    } finally {
      setBusy(b => ({ ...b, [kind]: false }));
    }
  }

  // ── Download All ──────────────────────────────────────────────────────────

  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [downloadAllReport, setDownloadAllReport] = useState<string | null>(null);

  async function downloadAll() {
    setDownloadAllBusy(true);
    setDownloadAllReport(null);
    const skipped: string[] = [];
    const failed: string[] = [];
    let succeeded = 0;

    // Sequential — each generation triggers a real browser download, and
    // firing them concurrently races the download prompts against each other.
    for (const kind of DOCUMENT_ORDER) {
      const status = statusFor(kind);
      if (status.kind === "blocked" || status.kind === "waiting") {
        skipped.push(DOCUMENT_META[kind].label);
        continue;
      }
      const ok = await generateDoc(kind);
      if (ok) succeeded += 1;
      else failed.push(DOCUMENT_META[kind].label);
    }

    setDownloadAllBusy(false);
    const parts: string[] = [];
    if (succeeded) parts.push(`${succeeded} downloaded`);
    if (skipped.length) parts.push(`skipped (not ready): ${skipped.join(", ")}`);
    if (failed.length) parts.push(`failed: ${failed.join(", ")}`);
    setDownloadAllReport(parts.length ? parts.join(" · ") : "Nothing to download.");
  }

  // ── Save to Orders ────────────────────────────────────────────────────────

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // The archive keys a rental on these two, and rejects a save without them.
  const canSave = data.clubName.trim() !== "" && data.eventDate.trim() !== "";

  /**
   * Persist the workspace. Saving is idempotent: it always sends the current
   * document set, and the archive replaces any same-kind document it already
   * holds — so pressing this twice, or after regenerating a PDF, converges
   * rather than piling up duplicates.
   */
  async function saveToOrders() {
    setSaveBusy(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const documents = generatedDocuments();

      if (!data.currentOrderId) {
        const res = await saveOrderAction({
          clubName: data.clubName,
          eventDate: data.eventDate,
          rentalPrice: toNum(effective(data, "rentalPrice")),
          depositAmount: toNum(effective(data, "depositAmount")),
          snapshot: data,
          documents,
        });
        if (!res.ok) { setSaveError(res.error); return; }
        update("currentOrderId", res.data.id);
        setSaveNotice(
          documents.length
            ? `Saved as a new order with ${documents.length} document(s).`
            : "Saved as a new order. Generate documents and save again to attach them.",
        );
        return;
      }

      // Existing order: re-send every document, plus refresh the stored
      // snapshot so pricing/contract edits made since the first save persist.
      const patch = await updateOrderAction(data.currentOrderId, {
        clubName: data.clubName,
        eventDate: data.eventDate,
        rentalPrice: toNum(effective(data, "rentalPrice")),
        depositAmount: toNum(effective(data, "depositAmount")),
        snapshot: data,
      });
      if (!patch.ok) { setSaveError(patch.error); return; }

      for (const doc of documents) {
        const res = await addDocumentAction(data.currentOrderId, doc);
        if (!res.ok) { setSaveError(res.error); return; }
      }
      setSaveNotice(
        documents.length
          ? `Order updated — ${documents.length} document(s) archived.`
          : "Order updated.",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  // ── Row summaries ─────────────────────────────────────────────────────────

  const contractSummary = hydrated
    ? [
        effective(data, "rentalPrice") && `$${Number(effective(data, "rentalPrice")).toLocaleString("en-US")} fee`,
        effective(data, "depositAmount") && `$${Number(effective(data, "depositAmount")).toLocaleString("en-US")} deposit`,
        eventDateReadable,
      ].filter(Boolean).join(" · ") || undefined
    : undefined;

  const depositSummary = deposit.amount
    ? `$${Number(deposit.amount).toLocaleString("en-US")}${deposit.dueDate ? ` · due ${formatDateISO(deposit.dueDate)}` : ""}`
    : undefined;

  const rentalTotal = lineItemsTotal(rental.items);
  const rentalSummary = rentalTotal > 0
    ? `$${rentalTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${rental.dueDate ? ` · due ${formatDateISO(rental.dueDate)}` : ""}`
    : undefined;

  const creditMemoSummary = creditMemo.amount
    ? `$${Number(creditMemo.amount).toLocaleString("en-US")}${creditMemo.refundMethod ? ` · ${creditMemo.refundMethod}` : ""}`
    : undefined;

  const depositAmountHint = data.pricingBreakdown?.suggestedDeposit
    && typeof data.pricingBreakdown.depositRate === "number"
    && deposit.amount === String(Math.round(data.pricingBreakdown.suggestedDeposit))
    ? `Auto-filled at ${Math.round(data.pricingBreakdown.depositRate * 100)}% of total.`
    : undefined;

  const rentalTotalDescription = data.pricingBreakdown
    ? rentalTarget > 0
      ? `Pre-filled from your pricing breakdown, scaled to the negotiated total of $${Math.round(rentalTarget).toLocaleString("en-US")}. Edit any row freely.`
      : "Set the negotiated price on the pricing step to populate line items."
    : "No pricing breakdown found. Visit the Pricing page first or enter line items manually.";

  const creditMemoAmountHint = creditMemo.amount && creditMemo.amount === effective(data, "depositAmount")
    ? "Auto-filled from the contract’s deposit amount."
    : undefined;

  const creditMemoOriginalInvoiceHint = data.lastDepositInvoiceNumber
    ? `Auto-filled from your last generated deposit invoice (${data.lastDepositInvoiceNumber}).`
    : "Generate a deposit invoice first to auto-fill this.";

  return (
    <div className="space-y-10">
      <div>
        <StepIndicator current="documents" />
        <h1 className="page-title mt-6">Documents</h1>
        <p className="page-lede">
          Generate the four rental documents from here. Organization, event date, pricing, and
          contract terms are pulled from the earlier steps — tab-specific fields appear inside
          each row.
        </p>
      </div>

      <div className="space-y-4">
        <DocumentRow
          index={1}
          kind="contract"
          label={DOCUMENT_META.contract.label}
          subtitle={DOCUMENT_META.contract.subtitle}
          state={statusFor("contract")}
          summary={contractSummary}
          onDownload={() => generateDoc("contract")}
          busy={!!busy.contract}
          error={errors.contract ?? null}
          success={successes.contract ?? null}
        >
          <ContractPanel sign={contractSign} onSignChange={setContractSign} />
        </DocumentRow>

        <DocumentRow
          index={2}
          kind="deposit_invoice"
          label={DOCUMENT_META.deposit_invoice.label}
          subtitle={DOCUMENT_META.deposit_invoice.subtitle}
          state={statusFor("deposit_invoice")}
          summary={depositSummary}
          onDownload={() => generateDoc("deposit_invoice")}
          busy={!!busy.deposit_invoice}
          error={errors.deposit_invoice ?? null}
          success={successes.deposit_invoice ?? null}
        >
          <DepositPanel
            fields={deposit}
            onChange={patch => setDeposit(f => ({ ...f, ...patch }))}
            amountHint={depositAmountHint}
          />
        </DocumentRow>

        <DocumentRow
          index={3}
          kind="rental_invoice"
          label={DOCUMENT_META.rental_invoice.label}
          subtitle={DOCUMENT_META.rental_invoice.subtitle}
          state={statusFor("rental_invoice")}
          summary={rentalSummary}
          onDownload={() => generateDoc("rental_invoice")}
          busy={!!busy.rental_invoice}
          error={errors.rental_invoice ?? null}
          success={successes.rental_invoice ?? null}
        >
          <RentalPanel
            fields={rental}
            onChange={patch => setRental(f => ({ ...f, ...patch }))}
            onReset={resetRentalFromPricing}
            totalDescription={rentalTotalDescription}
          />
        </DocumentRow>

        <DocumentRow
          index={4}
          kind="credit_memo"
          label={DOCUMENT_META.credit_memo.label}
          subtitle={DOCUMENT_META.credit_memo.subtitle}
          state={statusFor("credit_memo")}
          summary={creditMemoSummary}
          onDownload={() => generateDoc("credit_memo")}
          busy={!!busy.credit_memo}
          error={errors.credit_memo ?? null}
          success={successes.credit_memo ?? null}
        >
          <CreditMemoPanel
            fields={creditMemo}
            onChange={patch => setCreditMemo(f => ({ ...f, ...patch }))}
            amountHint={creditMemoAmountHint}
            originalInvoiceHint={creditMemoOriginalInvoiceHint}
          />
        </DocumentRow>
      </div>

      {/* ── Download All + Save to Orders ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Finish Up</span>
          <span className="card-subtitle">Download everything at once, then archive the rental.</span>
        </div>
        <div className="card-body space-y-5">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={downloadAll}
              disabled={downloadAllBusy}
              className="btn-ghost"
            >
              {downloadAllBusy ? "Downloading…" : "Download All"}
            </button>
            {downloadAllReport && (
              <p className="text-[12.5px] text-muted">{downloadAllReport}</p>
            )}
          </div>

          <div className="border-t border-rule pt-5 flex items-start justify-between gap-6 flex-wrap">
            <div className="max-w-md">
              {data.currentOrderId ? (
                <p className="text-[12.5px] text-ink">
                  Attached to order{" "}
                  <Link href={`/host/orders/${data.currentOrderId}`} className="btn-link">
                    {data.currentOrderId}
                  </Link>.
                </p>
              ) : (
                <p className="text-[12.5px] text-muted">
                  Not yet saved to the order archive. Saving is separate from generating —
                  nothing is archived until you click this.
                </p>
              )}
              {!canSave && hydrated && (
                <p className="text-[12px] text-muted mt-1.5">
                  An organization and event date are required before a rental can be archived.
                </p>
              )}
              {saveError && <p className="text-warn text-[13px] mt-1.5">{saveError}</p>}
              {saveNotice && !saveError && <p className="text-ok text-[13px] mt-1.5">{saveNotice}</p>}
            </div>
            <button
              type="button"
              onClick={saveToOrders}
              disabled={saveBusy || !hydrated || !canSave}
              className="btn-primary"
            >
              {saveBusy ? "Saving…" : data.currentOrderId ? "Update Order" : "Save to Orders"}
            </button>
          </div>
        </div>
      </section>

      <StepNav current="documents" />
    </div>
  );
}
