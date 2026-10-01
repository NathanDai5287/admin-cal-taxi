"use client";
import { Button, ButtonLink } from "@/components/brand/button";

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
import DocumentRow, { type RowState } from "@/components/host/DocumentRow";
import DocumentsSection from "@/components/host/DocumentsSection";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { effective, effectiveRentalPrice, liveBreakdown } from "@/lib/host-derive";
import { cleanClubs, clubsDisplay } from "@/lib/host-clubs";
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
import PaymentMessagePanel from "./PaymentMessagePanel";
import SigningPanel from "./SigningPanel";

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
  const { hydrated, data, update, bulk } = useSharedData();

  // ── Per-document local fields ─────────────────────────────────────────────
  const contractSign = data.contractPresign;

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

  // ── Seeding ───────────────────────────────────────────────────────────────
  // Each seeded field tracks its source until the user edits it. A change
  // upstream (event date moves, deposit renegotiated) re-seeds any field the
  // user hasn't touched, so a stale copy of an earlier event's values can't
  // ride along. Once the user types into a field, it's theirs.

  const [depositAmountEdited, setDepositAmountEdited] = useState(false);
  const [depositDueEdited, setDepositDueEdited] = useState(false);
  const [rentalDueEdited, setRentalDueEdited] = useState(false);
  const [creditAmountEdited, setCreditAmountEdited] = useState(false);
  const [originalInvoiceEdited, setOriginalInvoiceEdited] = useState(false);

  // Deposit: amount ← effective(depositAmount), due date ← event date minus 7 days.
  const initialDepositAmount = hydrated ? effective(data, "depositAmount") : "";
  useEffect(() => {
    if (!hydrated || depositAmountEdited || !initialDepositAmount) return;
    setDeposit(f => ({ ...f, amount: initialDepositAmount }));
  }, [hydrated, depositAmountEdited, initialDepositAmount]);

  useEffect(() => {
    if (!hydrated || depositDueEdited || !data.eventDate) return;
    setDeposit(f => ({ ...f, dueDate: addDaysIso(data.eventDate, -7) }));
  }, [hydrated, depositDueEdited, data.eventDate]);

  // Rental: due date ← event date + 2 days.
  useEffect(() => {
    if (!hydrated || rentalDueEdited || !data.eventDate) return;
    const computed = addDaysIso(data.eventDate, 2);
    if (computed) setRental(f => ({ ...f, dueDate: computed }));
  }, [hydrated, rentalDueEdited, data.eventDate]);

  // Rental: line items ← buildLineItems(live breakdown, negotiated total).
  // The breakdown is computed from the current guests + selections on every
  // render, so the items can never reflect an earlier pass through pricing.
  // Re-derives whenever the source of truth changes; manual edits within a
  // session survive re-renders since `rental.items` isn't in the dep list.
  const breakdown = hydrated ? liveBreakdown(data) : null;
  const rentalTarget = useMemo(() => {
    const finalNum = parseFloat(effective(data, "finalPrice"));
    if (Number.isFinite(finalNum) && finalNum > 0) return finalNum;
    return breakdown?.total ?? 0;
  }, [data, breakdown]);
  const eventDateReadable = data.eventDate ? formatDateISO(data.eventDate) : "";
  // The selections are fingerprinted too: two different selections can share
  // a subtotal and total while producing different line items.
  const rentalDerivedKey = `${rentalTarget}|${breakdown?.subtotal ?? "x"}|${eventDateReadable}|${JSON.stringify(data.pricingSelections)}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      setRental(f => ({ ...f, items: buildLineItems(liveBreakdown(data), rentalTarget, eventDateReadable) }));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, rentalDerivedKey]);

  function resetRentalFromPricing() {
    setRental(f => ({ ...f, items: buildLineItems(liveBreakdown(data), rentalTarget, eventDateReadable) }));
  }

  // Credit memo: refund amount ← the contract's deposit, tracking it until
  // the user types a different number.
  useEffect(() => {
    if (!hydrated || creditAmountEdited) return;
    const suggested = effective(data, "depositAmount");
    if (suggested) setCreditMemo(f => ({ ...f, amount: suggested }));
  }, [hydrated, creditAmountEdited, data]);

  // Credit memo: original invoice ← last generated deposit invoice number.
  // Re-seeds whenever that number changes (including a deposit invoice
  // regenerated with a new number in this same session), as long as the user
  // hasn't typed one — an auto-filled value must never point at a superseded
  // invoice.
  useEffect(() => {
    if (!hydrated || originalInvoiceEdited) return;
    const latest = data.lastDepositInvoiceNumber;
    if (latest) {
      setCreditMemo(f => (f.originalInvoice === latest ? f : { ...f, originalInvoice: latest }));
    }
  }, [hydrated, originalInvoiceEdited, data.lastDepositInvoiceNumber]);

  // ── Generation state ──────────────────────────────────────────────────────

  // `generatedRef` is the read-fresh source of truth for the "has this kind
  // been generated" question — needed because Download All decides, mid-loop,
  // whether the credit memo has just been unblocked by a deposit invoice it
  // generated a moment earlier. Plain state read through a closure would be
  // stale until the next render; the ref never is. `renderTick` just forces
  // the re-render so the UI reflects it.
  const generatedRef = useRef<GeneratedMap>({});
  const [, setRenderTick] = useState(0);

  // Generated documents belong to the event identity (organizations + date)
  // they were generated from — their payloads bake those in. When the identity
  // changes on the earlier steps, every document generated under the old one
  // is void: drop the map so a stale contract/invoice can't be downloaded as
  // "current", unblock checks can't borrow the old deposit-invoice number,
  // and Save can't archive old-identity PDFs onto the new event's order.
  const identityKey = hydrated
    ? `${cleanClubs(data.clubs).join("\n")}|${data.eventDate}`
    : "";
  const identityRef = useRef(identityKey);
  useEffect(() => {
    if (identityRef.current === identityKey) return;
    identityRef.current = identityKey;
    generatedRef.current = {};
    setRenderTick(v => v + 1);
  }, [identityKey]);

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

  async function generateDoc(
    kind: DocumentKind,
    batch?: { depositInvoiceNumber?: string; memoOriginalInvoice?: string },
  ): Promise<boolean> {
    setErrors(e => ({ ...e, [kind]: null }));
    setSuccesses(s => ({ ...s, [kind]: null }));
    setBusy(b => ({ ...b, [kind]: true }));
    try {
      let payload: Record<string, unknown>;
      let amount: number | null;

      switch (kind) {
        case "contract": {
          payload = buildContractPayload(data, { sign: contractSign });
          amount = toNum(effectiveRentalPrice(data));
          break;
        }
        case "deposit_invoice": {
          payload = buildDepositPayload(data, {
            ...deposit,
            invoiceNumber: batch?.depositInvoiceNumber ?? deposit.invoiceNumber,
          });
          amount = toNum(deposit.amount);
          break;
        }
        case "rental_invoice": {
          payload = buildRentalPayload(data, rental);
          amount = lineItemsTotal(rental.items);
          break;
        }
        case "credit_memo": {
          const fields: CreditMemoFields = {
            ...creditMemo,
            originalInvoice: batch?.memoOriginalInvoice ?? resolvedOriginalInvoice(),
          };
          payload = buildCreditMemoPayload(data, fields);
          amount = toNum(fields.amount);
          break;
        }
      }

      const { filename } = await generatePdf(DOCUMENT_META[kind].endpoint, payload);
      const number = kind === "contract"
        ? mintContractNumber(cleanClubs(data.clubs)[0] ?? "partner", data.eventDate)
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

    // Give the deposit invoice and credit memo the same number before starting
    // requests, since the memo can no longer wait for the deposit response.
    const depositStatus = statusFor("deposit_invoice");
    const canGenerateDeposit = depositStatus.kind === "ready" || depositStatus.kind === "generated";
    const depositInvoiceNumber = canGenerateDeposit
      ? deposit.invoiceNumber.trim()
        || generatedRef.current.deposit_invoice?.number
        || data.lastDepositInvoiceNumber
        || mintContractNumber(cleanClubs(data.clubs)[0] ?? "partner", data.eventDate).replace(/^CTR-/, "DEP-")
      : "";
    const memoOriginalInvoice = creditMemo.originalInvoice.trim() || depositInvoiceNumber;
    const ready: DocumentKind[] = [];
    for (const kind of DOCUMENT_ORDER) {
      const status = kind === "credit_memo" && memoOriginalInvoice
        ? missingFields(kind, data, {
            ...fieldsFor(),
            creditMemo: { ...creditMemo, originalInvoice: memoOriginalInvoice },
          })
        : null;
      const rowStatus = status ? (status.length ? { kind: "blocked" } : { kind: "ready" }) : statusFor(kind);
      if (rowStatus.kind === "blocked" || rowStatus.kind === "waiting") {
        skipped.push(DOCUMENT_META[kind].label);
        continue;
      }
      ready.push(kind);
    }
    const results = await Promise.all(ready.map(kind => generateDoc(kind, {
      depositInvoiceNumber,
      memoOriginalInvoice: memoOriginalInvoice || undefined,
    })));
    ready.forEach((kind, index) => {
      const ok = results[index];
      if (ok) succeeded += 1;
      else failed.push(DOCUMENT_META[kind].label);
    });

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
  const createRequestKeyRef = useRef("");
  useEffect(() => { createRequestKeyRef.current = data.orderCreateRequestKey; }, [data.orderCreateRequestKey, identityKey]);

  // The archive keys a rental on these two, and rejects a save without them.
  const canSave = cleanClubs(data.clubs).length > 0 && data.eventDate.trim() !== "";

  // Identity divergence: the workspace was loaded from (or saved as) an
  // order whose organization/date no longer matches. Updating would rewrite
  // that order's identity in place — surface it before the click.
  const identityNow = `${clubsDisplay(data.clubs)}|${data.eventDate}`;
  const [loadedClub, loadedDate] = data.loadedOrderIdentity.split("|");
  const identityDrifted = Boolean(
    data.currentOrderId && data.loadedOrderIdentity && data.loadedOrderIdentity !== identityNow,
  );

  /**
   * The historical record stored on the order. Derived values are resolved
   * here, at save time, so the archive shows what was actually true when the
   * rental was saved — the live workspace itself stores none of them.
   */
  function orderSnapshot(): Record<string, unknown> {
    return {
      ...data,
      pricingBreakdown: liveBreakdown(data),
      rentalPrice: effectiveRentalPrice(data),
      depositAmount: effective(data, "depositAmount"),
      maxGuests: effective(data, "maxGuests"),
    };
  }

  /**
   * Persist the workspace. Saving is idempotent: it always sends the current
   * document set, and the archive replaces any same-kind document it already
   * holds — so pressing this twice, or after regenerating a PDF, converges
   * rather than piling up duplicates.
   */
  async function saveToOrders(skipContract = false): Promise<string | null> {
    setSaveBusy(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const documents = generatedDocuments().filter(doc => !skipContract || doc.kind !== "contract");
      const clubName = clubsDisplay(data.clubs);

      if (!data.currentOrderId) {
        const requestKey = data.orderCreateRequestKey || createRequestKeyRef.current || crypto.randomUUID();
        createRequestKeyRef.current = requestKey;
        if (!data.orderCreateRequestKey) update("orderCreateRequestKey", requestKey);
        const res = await saveOrderAction({
          requestKey,
          clubName,
          eventDate: data.eventDate,
          rentalPrice: toNum(effectiveRentalPrice(data)),
          depositAmount: toNum(effective(data, "depositAmount")),
          snapshot: orderSnapshot(),
          documents,
        });
        if (!res.ok) { setSaveError(res.error); return null; }
        bulk({ currentOrderId: res.data.id, loadedOrderIdentity: `${clubName}|${data.eventDate}` });
        setSaveNotice(
          documents.length
            ? `Saved as a new order with ${documents.length} document(s).`
            : "Saved as a new order. Generate documents and save again to attach them.",
        );
        return res.data.id;
      }

      // Existing order: re-send every document, plus refresh the stored
      // snapshot so pricing/contract edits made since the first save persist.
      const patch = await updateOrderAction(data.currentOrderId, {
        clubName,
        eventDate: data.eventDate,
        rentalPrice: toNum(effectiveRentalPrice(data)),
        depositAmount: toNum(effective(data, "depositAmount")),
        snapshot: orderSnapshot(),
      });
      if (!patch.ok) { setSaveError(patch.error); return null; }

      for (const doc of documents) {
        const res = await addDocumentAction(data.currentOrderId, doc);
        if (!res.ok) { setSaveError(res.error); return null; }
      }
      // The order now matches the workspace — reset the divergence baseline.
      bulk({ loadedOrderIdentity: `${clubName}|${data.eventDate}` });
      setSaveNotice(
        documents.length
          ? `Order updated — ${documents.length} document(s) archived.`
          : "Order updated.",
      );
      return data.currentOrderId;
    } catch (err) {
      setSaveError(errorMessage(err));
      return null;
    } finally {
      setSaveBusy(false);
    }
  }

  // ── Row summaries ─────────────────────────────────────────────────────────

  const contractSummary = hydrated
    ? [
        effectiveRentalPrice(data) && `$${Number(effectiveRentalPrice(data)).toLocaleString("en-US")} fee`,
        effective(data, "depositAmount") && `$${Number(effective(data, "depositAmount")).toLocaleString("en-US")} deposit`,
        eventDateReadable,
        contractSign && "auto-signed",
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

  const depositAmountHint = breakdown
    && deposit.amount === String(Math.round(breakdown.suggestedDeposit))
    ? `Auto-filled at ${Math.round(breakdown.depositRate * 100)}% of total.`
    : undefined;

  const rentalTotalDescription = breakdown
    ? rentalTarget > 0
      ? `Pre-filled from your pricing breakdown, scaled to the negotiated total of $${Math.round(rentalTarget).toLocaleString("en-US")}. Edit any row freely.`
      : "Set the negotiated price on the pricing step to populate line items."
    : "No guest count yet. Set one on the Event Details step, or enter line items manually.";

  const creditMemoAmountHint = creditMemo.amount && creditMemo.amount === effective(data, "depositAmount")
    ? "Auto-filled from the contract’s deposit amount."
    : undefined;

  const creditMemoOriginalInvoiceHint = data.lastDepositInvoiceNumber
    ? `Auto-filled from your last generated deposit invoice (${data.lastDepositInvoiceNumber}).`
    : "Generate a deposit invoice first to auto-fill this.";

  return (
    <div className="space-y-8">
      <div>
        <StepIndicator current="documents" />
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="page-title">Documents</h1>
        </div>
      </div>

      <DocumentsSection
        actions={<>
          <div className="flex flex-nowrap items-center gap-3">
            <Button
              type="button"
              onClick={downloadAll}
              disabled={downloadAllBusy}
              variant="secondary"
              compact
              className="min-w-0 flex-1 sm:flex-none"
            >
              {downloadAllBusy ? "Downloading…" : "Download All"}
            </Button>
            <Button
              type="button"
              onClick={() => { void saveToOrders(); }}
              disabled={saveBusy || !hydrated || !canSave}
              variant="primary"
              compact
              className="min-w-0 flex-1 sm:flex-none"
            >
              {saveBusy ? "Saving…" : data.currentOrderId ? "Update Order" : "Save to Orders"}
            </Button>
            {data.currentOrderId && (
              <ButtonLink href={`/host/orders/${data.currentOrderId}`} variant="text" className="ml-auto whitespace-nowrap">
                <span className="hidden md:inline">Order: {data.currentOrderId}</span>
                <span className="md:hidden">Order</span>
              </ButtonLink>
            )}
          </div>
          {downloadAllReport && <p className="text-[12.5px] text-muted">{downloadAllReport}</p>}
          {!canSave && hydrated && (
            <p className="text-[12px] text-muted">Add an organization and event date before saving this order.</p>
          )}
          {identityDrifted && (
            <p className="text-[12px] text-warn">
              This workspace no longer matches the attached order (saved as {loadedClub || "unknown organization"}
              {loadedDate ? `, ${formatDateISO(loadedDate) || loadedDate}` : ""}).
              Updating will rewrite that order&rsquo;s organization and date in place. To start
              a new event from these details, use Duplicate on the order page.
            </p>
          )}
          {saveError && <p className="text-warn text-[13px]">{saveError}</p>}
          {saveNotice && !saveError && <p className="text-ok text-[13px]">{saveNotice}</p>}
        </>}
        paymentMessage={
          <PaymentMessagePanel
            eventDate={hydrated ? data.eventDate : ""}
            depositAmount={hydrated ? effective(data, "depositAmount") : ""}
            rentalAmount={hydrated ? Number(effectiveRentalPrice(data)) : 0}
          />
        }
      >
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
          defaultOpen
          grouped
          inlineFields
        >
          <ContractPanel sign={contractSign} onSignChange={value => update("contractPresign", value)} />
        </DocumentRow>
        <SigningPanel data={data} update={update} orderId={data.currentOrderId} saveOrder={() => saveToOrders(true)} />

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
          grouped
        >
          <DepositPanel
            fields={deposit}
            onChange={patch => {
              if (patch.amount !== undefined) setDepositAmountEdited(true);
              if (patch.dueDate !== undefined) setDepositDueEdited(true);
              setDeposit(f => ({ ...f, ...patch }));
            }}
            amountHint={depositAmountHint}
            resets={{
              amount: depositAmountEdited ? () => setDepositAmountEdited(false) : undefined,
              dueDate: depositDueEdited ? () => setDepositDueEdited(false) : undefined,
            }}
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
          grouped
        >
          <RentalPanel
            fields={rental}
            onChange={patch => {
              if (patch.dueDate !== undefined) setRentalDueEdited(true);
              setRental(f => ({ ...f, ...patch }));
            }}
            onReset={resetRentalFromPricing}
            totalDescription={rentalTotalDescription}
            resets={{
              dueDate: rentalDueEdited ? () => setRentalDueEdited(false) : undefined,
            }}
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
          grouped
        >
          <CreditMemoPanel
            fields={creditMemo}
            onChange={patch => {
              if (patch.amount !== undefined) setCreditAmountEdited(true);
              if (patch.originalInvoice !== undefined) setOriginalInvoiceEdited(true);
              setCreditMemo(f => ({ ...f, ...patch }));
            }}
            amountHint={creditMemoAmountHint}
            originalInvoiceHint={creditMemoOriginalInvoiceHint}
            resets={{
              amount: creditAmountEdited ? () => setCreditAmountEdited(false) : undefined,
              originalInvoice: originalInvoiceEdited ? () => setOriginalInvoiceEdited(false) : undefined,
            }}
          />
        </DocumentRow>
      </DocumentsSection>

      <StepNav current="documents" />
    </div>
  );
}
