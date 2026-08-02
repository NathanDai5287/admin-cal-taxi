"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import LineItemList, { LineItem } from "@/components/host/LineItemList";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import { addDaysIso, formatDateISO, todayIso, roundCents } from "@/lib/host-format";
import { effective } from "@/lib/host-derive";
import { PricingBreakdown, useSharedData } from "@/lib/host-shared-state";

type Mode = "deposit" | "rental" | "credit_memo";

const TABS: { key: Mode; label: string; subtitle: string }[] = [
  { key: "deposit",     label: "Security Deposit", subtitle: "Invoice — due before event" },
  { key: "rental",      label: "Rental Payment",   subtitle: "Itemized invoice — after event" },
  { key: "credit_memo", label: "Deposit Refund",   subtitle: "Credit memo — after event" },
];

/**
 * Build itemized rental invoice lines from the pricing breakdown, scaled
 * proportionally to the negotiated total. Produces no separate
 * "relationship discount/surcharge" row — the relationship adjustment is
 * already baked into `target`, and individual components scale to match.
 *
 * If `breakdown` is missing OR `target` is non-positive, returns a single
 * generic line so the user can fill it in manually.
 */
function buildLineItems(
  breakdown: PricingBreakdown | null,
  target: number,
  eventDateReadable: string,
): LineItem[] {
  // Components in display order. Each is the *raw* (pre-wealth) amount
  // — that's what the breakdown stores in .base/.alcohol/etc.
  type Comp = { description: string; raw: number };
  const components: Comp[] = [];

  if (breakdown) {
    components.push({ description: "Base rental — Theta Xi Fraternity House", raw: breakdown.base });
    if (breakdown.capacity > 0) {
      const over = Math.max(0, breakdown.guests - breakdown.capacityThreshold);
      components.push({
        description: `Capacity fee — ${breakdown.guests} guests (${over} over included threshold)`,
        raw: breakdown.capacity,
      });
    }
    if (breakdown.firePermit > 0) {
      components.push({
        description: "Fire permit (Required for > 50 guests)",
        raw: breakdown.firePermit,
      });
    }
    if (breakdown.alcohol > 0)
      components.push({ description: `Alcohol — ${breakdown.alcoholLabel}`, raw: breakdown.alcohol });
    if (breakdown.protection > 0)
      components.push({ description: `Property protection — ${breakdown.protectionLabel}`, raw: breakdown.protection });
    if (breakdown.date > 0)
      components.push({ description: `Date surcharge — ${breakdown.dateLabel}`, raw: breakdown.date });
    if (breakdown.setup > 0)
      components.push({ description: `Setup — ${breakdown.setupLabel}`, raw: breakdown.setup });
    if (breakdown.cleanup > 0)
      components.push({ description: `Cleanup — ${breakdown.cleanupLabel}`, raw: breakdown.cleanup });
  }

  const rawSum = components.reduce((s, c) => s + c.raw, 0);

  // Fall back to a single line if we can't itemize meaningfully.
  if (components.length === 0 || rawSum <= 0 || !(target > 0)) {
    const desc = eventDateReadable
      ? `Rental of the Theta Xi Fraternity House for the event on ${eventDateReadable}`
      : "Rental of the Theta Xi Fraternity House";
    return [{ description: desc, amount: target > 0 ? target.toFixed(2) : "" }];
  }

  // Scale each component to the negotiated total. The last line absorbs
  // any rounding remainder so the sum is exact.
  const scale = target / rawSum;
  const lines: LineItem[] = [];
  let runningSum = 0;
  components.forEach((c, i) => {
    const isLast = i === components.length - 1;
    const value = isLast
      ? roundCents(target - runningSum)
      : roundCents(c.raw * scale);
    runningSum = roundCents(runningSum + value);
    lines.push({ description: c.description, amount: value.toFixed(2) });
  });
  return lines;
}

// =============================================================================
//  Page
// =============================================================================

export default function InvoicePage() {
  const [mode, setMode] = useState<Mode>("deposit");

  return (
    <div className="space-y-10">
      <div>
        <StepIndicator current="invoice" />
        <h1 className="page-title mt-6">Invoices &amp; Credit Memo</h1>
        <p className="page-lede">
          All three documents share the contract&rsquo;s branding and reference its terms by
          section. Organization and event date are pulled from the earlier steps; tab-specific
          fields appear inside each tab.
        </p>
      </div>

      <div>
        <div className="tab-bar" role="tablist">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={mode === t.key}
              onClick={() => setMode(t.key)}
              className={"tab" + (mode === t.key ? " active" : "")}
            >
              <span className="tab-label">{t.label}</span>
              <span className="tab-sub">{t.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="border border-t-0 border-rule bg-white p-6">
          {mode === "deposit"     && <DepositForm />}
          {mode === "rental"      && <RentalForm />}
          {mode === "credit_memo" && <CreditMemoForm />}
        </div>
      </div>

      <StepNav current="invoice" />
    </div>
  );
}

// =============================================================================
//  Shared atoms
// =============================================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function FormStatus({
  busy, error, success, submitLabel, disabled, disabledHint,
}: {
  busy: boolean; error: string | null; success: string | null;
  submitLabel: string; disabled?: boolean; disabledHint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 flex-wrap pt-2 border-t border-rule">
      <div className="flex-1 min-w-[200px] pt-4">
        {error   && <p className="text-warn text-[13px]">{error}</p>}
        {success && <p className="text-ok text-[13px]">{success}</p>}
        {disabled && !error && !success && (
          <p className="text-[12px] text-muted">{disabledHint ?? "Fill in required fields to continue."}</p>
        )}
      </div>
      <button type="submit" disabled={busy || disabled} className="btn-primary mt-4">
        {busy ? "Generating…" : submitLabel}
      </button>
    </div>
  );
}

function invoiceNumberFromFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}

// =============================================================================
//  Deposit invoice
// =============================================================================

function DepositForm() {
  const { hydrated, data, update } = useSharedData();

  // Default deposit amount from contract.depositAmount, falling back to
  // pricingBreakdown.suggestedDeposit. Local state so the user can override
  // without writing to the contract draft.
  const initialAmount = !hydrated ? "" : effective(data, "depositAmount");

  const [amount, setAmount]            = useState("");
  const [issueDate, setIssueDate]      = useState(todayIso());
  const [dueDate, setDueDate]          = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [busy, setBusy]                = useState(false);
  const [error, setError]              = useState<string | null>(null);
  const [success, setSuccess]          = useState<string | null>(null);

  // Seed amount from initialAmount once hydrated.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydrated && !amount && initialAmount) setAmount(initialAmount);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, initialAmount]);

  // Auto-fill due date to event date (same day, 1 hour before event).
  // Runs once after hydration; the user can override and we won't clobber.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      if (!dueDate && data.eventDate) {
        setDueDate(data.eventDate);
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, data.eventDate]);

  const sharedReady = hydrated && data.clubName.trim() !== "" && data.eventDate.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setBusy(true);
    try {
      const body: Record<string, string> = {
        club_name:  data.clubName,
        event_date: formatDateISO(data.eventDate),
        amount,
        issue_date: formatDateISO(issueDate),
        due_date:   formatDateISO(dueDate),
      };
      if (invoiceNumber)         body.invoice_number    = invoiceNumber;
      if (data.treasurerName)    body.treasurer_name    = data.treasurerName;
      if (data.treasurerContact) body.treasurer_contact = data.treasurerContact;
      const { filename } = await generatePdf("/api/host/generate/invoice/deposit", body);
      setSuccess(`Downloaded ${filename}`);
      update("lastDepositInvoiceNumber", invoiceNumberFromFilename(filename));
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message
            : err instanceof Error      ? err.message
            : "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Deposit Amount (USD)"
          hint={data.pricingBreakdown?.suggestedDeposit
            && typeof data.pricingBreakdown.depositRate === "number"
            && amount === String(Math.round(data.pricingBreakdown.suggestedDeposit))
            ? `Auto-filled at ${Math.round(data.pricingBreakdown.depositRate * 100)}% of total.`
            : undefined}
        >
          <input className="field-input" type="number" min={0} step="0.01" required
            placeholder="e.g. 100"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="Issue Date">
          <input type="date" className="field-input" required
            value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Due Before">
          <input type="date" className="field-input" required
            value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
        <Field label="Invoice Number" hint="Optional. Leave blank to auto-generate.">
          <input className="field-input" placeholder="auto: DEP-YYYY-MMDD-XXXXXX"
            value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
        </Field>
      </div>

      <FormStatus
        busy={busy} error={error} success={success}
        submitLabel="Generate Deposit Invoice"
        disabled={!sharedReady}
        disabledHint="Set organization and event date on the home step first."
      />
    </form>
  );
}

// =============================================================================
//  Rental invoice (itemized, proportionally scaled to negotiated total)
// =============================================================================

function RentalForm() {
  const { hydrated, data } = useSharedData();
  const [items, setItems]              = useState<LineItem[]>([]);
  const [issueDate, setIssueDate]      = useState(todayIso());
  const [dueDate, setDueDate]          = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [busy, setBusy]                = useState(false);
  const [error, setError]              = useState<string | null>(null);
  const [success, setSuccess]          = useState<string | null>(null);

  // Default the due date to event_date + 2 days (matches contract section 02).
  // Runs once after hydration; the user can override and we won't clobber.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      if (!dueDate && data.eventDate) {
        const computed = addDaysIso(data.eventDate, 2);
        if (computed) setDueDate(computed);
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, data.eventDate]);

  // The negotiated price drives the line items. Falls back to the calculator
  // total if the user hasn't typed anything; falls back to 0 if nothing yet.
  const target = useMemo(() => {
    const finalNum = parseFloat(effective(data, "finalPrice"));
    if (Number.isFinite(finalNum) && finalNum > 0) return finalNum;
    return data.pricingBreakdown?.total ?? 0;
  }, [data]);

  const eventDateReadable = data.eventDate ? formatDateISO(data.eventDate) : "";

  // Re-derive line items when the source of truth changes (target or breakdown).
  // Manual edits within a session are preserved across re-renders since the
  // dep list doesn't include `items`.
  const derivedKey = `${target}|${data.pricingBreakdown?.subtotal ?? "x"}|${eventDateReadable}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hydrated) return;
      setItems(buildLineItems(data.pricingBreakdown, target, eventDateReadable));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, derivedKey]);

  function reseed() {
    setItems(buildLineItems(data.pricingBreakdown, target, eventDateReadable));
  }

  const sharedReady = hydrated && data.clubName.trim() !== "" && data.eventDate.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) {
      setError("Add at least one line item.");
      return;
    }
    setError(null); setSuccess(null); setBusy(true);
    try {
      const body: Record<string, unknown> = {
        club_name:  data.clubName,
        event_date: formatDateISO(data.eventDate),
        issue_date: formatDateISO(issueDate),
        due_date:   formatDateISO(dueDate),
        line_items: items.map(it => ({
          description: it.description,
          amount: it.amount,
        })),
      };
      if (invoiceNumber)         body.invoice_number    = invoiceNumber;
      if (data.treasurerName)    body.treasurer_name    = data.treasurerName;
      if (data.treasurerContact) body.treasurer_contact = data.treasurerContact;
      const { filename } = await generatePdf("/api/host/generate/invoice/rental", body);
      setSuccess(`Downloaded ${filename}`);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message
            : err instanceof Error      ? err.message
            : "request failed");
    } finally {
      setBusy(false);
    }
  }

  const totalDescription = data.pricingBreakdown
    ? target > 0
      ? `Pre-filled from your pricing breakdown, scaled to the negotiated total of $${Math.round(target).toLocaleString("en-US")}. Edit any row freely.`
      : "Set the negotiated price on the pricing step to populate line items."
    : "No pricing breakdown found. Visit the Pricing page first or enter line items manually.";

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Issue Date">
          <input type="date" className="field-input" required
            value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Due Date">
          <input type="date" className="field-input" required
            value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
        <Field label="Invoice Number" hint="Optional. Leave blank to auto-generate.">
          <input className="field-input" placeholder="auto: RNT-YYYY-MMDD-XXXXXX"
            value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
        </Field>
      </div>

      <hr className="border-rule" />

      <div>
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <div>
            <div className="card-title">Line Items</div>
            <p className="text-[12px] text-muted mt-1.5 max-w-md">{totalDescription}</p>
          </div>
          <button
            type="button"
            onClick={reseed}
            className="btn-link"
            title="Re-derive from current pricing selections and negotiated total"
          >
            Reset from Pricing
          </button>
        </div>

        <LineItemList items={items} onChange={setItems} />
      </div>

      <FormStatus
        busy={busy} error={error} success={success}
        submitLabel="Generate Rental Invoice"
        disabled={!sharedReady}
        disabledHint="Set organization and event date on the home step first."
      />
    </form>
  );
}

// =============================================================================
//  Credit memo
// =============================================================================

function CreditMemoForm() {
  const { hydrated, data } = useSharedData();
  const [amount, setAmount]              = useState("");
  const [issueDate, setIssueDate]        = useState(todayIso());
  const [originalInvoice, setOriginalInvoice] = useState("");
  const [refundMethod, setRefundMethod]  = useState("");
  const [refundDescription, setRefundDescription] = useState("");
  const [memoNumber, setMemoNumber]      = useState("");
  const [busy, setBusy]                  = useState(false);
  const [error, setError]                = useState<string | null>(null);
  const [success, setSuccess]            = useState<string | null>(null);

  // Pre-fill amount + original invoice once after hydration. After that,
  // the user owns these values.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydrated && !seeded) {
        if (data.lastDepositInvoiceNumber && !originalInvoice) {
          setOriginalInvoice(data.lastDepositInvoiceNumber);
        }
        if (!amount) {
          const suggested = effective(data, "depositAmount");
          if (suggested) setAmount(suggested);
        }
        setSeeded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [hydrated, seeded, data, originalInvoice, amount]);

  const sharedReady = hydrated && data.clubName.trim() !== "" && data.eventDate.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setBusy(true);
    try {
      const body: Record<string, string> = {
        club_name:        data.clubName,
        event_date:       formatDateISO(data.eventDate),
        amount,
        issue_date:       formatDateISO(issueDate),
        original_invoice: originalInvoice,
      };
      if (refundMethod)          body.refund_method      = refundMethod;
      if (refundDescription)     body.refund_description = refundDescription;
      if (memoNumber)            body.memo_number        = memoNumber;
      if (data.treasurerName)    body.treasurer_name     = data.treasurerName;
      if (data.treasurerContact) body.treasurer_contact  = data.treasurerContact;
      const { filename } = await generatePdf("/api/host/generate/credit-memo", body);
      setSuccess(`Downloaded ${filename}`);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message
            : err instanceof Error      ? err.message
            : "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Refund Amount (USD)" hint={amount && amount === effective(data, "depositAmount")
          ? "Auto-filled from the contract’s deposit amount."
          : undefined}>
          <input className="field-input" type="number" min={0} step="0.01" required
            placeholder="e.g. 100"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="Issue Date">
          <input type="date" className="field-input" required
            value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Original Deposit Invoice"
          hint={data.lastDepositInvoiceNumber
            ? `Auto-filled from your last generated deposit invoice (${data.lastDepositInvoiceNumber}).`
            : "Generate a deposit invoice first to auto-fill this."}>
          <input className="field-input" required placeholder="e.g. DEP-2026-0315-PISIGM"
            value={originalInvoice} onChange={e => setOriginalInvoice(e.target.value)} />
        </Field>
        <Field label="Refund Method">
          <input className="field-input"
            placeholder="e.g. Zelle to organization treasurer"
            value={refundMethod} onChange={e => setRefundMethod(e.target.value)} />
        </Field>
        <Field label="Refund Description" hint="Optional. Auto-generated when blank.">
          <textarea className="field-textarea"
            placeholder="auto: Refund of security deposit for the event on …"
            value={refundDescription} onChange={e => setRefundDescription(e.target.value)} />
        </Field>
        <Field label="Memo Number" hint="Optional. Leave blank to auto-generate.">
          <input className="field-input" placeholder="auto: CM-YYYY-MMDD-XXXXXX"
            value={memoNumber} onChange={e => setMemoNumber(e.target.value)} />
        </Field>
      </div>

      <FormStatus
        busy={busy} error={error} success={success}
        submitLabel="Generate Credit Memo"
        disabled={!sharedReady}
        disabledHint="Set organization and event date on the home step first."
      />
    </form>
  );
}
