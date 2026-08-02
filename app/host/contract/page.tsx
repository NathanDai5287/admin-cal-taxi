"use client";

import { useState } from "react";
import { ApiCallError, generatePdf } from "@/lib/host-api";
import { AreaKey, OverrideKey, useSharedData } from "@/lib/host-shared-state";
import { autoValue, effective, hasDiverged } from "@/lib/host-derive";
import { formatDateISO } from "@/lib/host-format";
import { StepIndicator, StepNav } from "@/components/host/StepNav";

const AREAS: { key: AreaKey; label: string; clearedDesc: string }[] = [
  { key: "living_room", label: "Living Room", clearedDesc: "the couches, tables, and carpet" },
  { key: "dining_room", label: "Dining Room", clearedDesc: "the dining table and chairs" },
  { key: "backyard",    label: "Backyard",    clearedDesc: "everything off the cement area in the center" },
];

export default function ContractPage() {
  const { hydrated, data, update } = useSharedData();
  // Sign is intentionally local + reset on each page visit.
  const [sign, setSign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fee, deposit, and max guests are derived from the pricing step on every
  // render (see lib/host-derive.ts) rather than copied in once — so they can't
  // hold a stale number from an earlier pass through the flow.
  const rentalPrice   = hydrated ? effective(data, "rentalPrice")   : "";
  const depositAmount = hydrated ? effective(data, "depositAmount") : "";
  const maxGuests     = hydrated ? effective(data, "maxGuests")     : "";

  function setArea(key: AreaKey, on: boolean) {
    update("areas", { ...data.areas, [key]: on });
    if (!on) update("cleared", { ...data.cleared, [key]: false });
  }
  function setCleared(key: AreaKey, on: boolean) {
    update("cleared", { ...data.cleared, [key]: on });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setBusy(true);
    try {
      const selectedAreas = AREAS.filter(a => data.areas[a.key]).map(a => a.key);
      const clearedMap: Record<string, boolean> = {};
      selectedAreas.forEach(k => { clearedMap[k] = data.cleared[k]; });

      const cleanupIdx = Math.min(Math.max(data.pricingSelections.cleanup, 0), 1);
      const cleanupTier = cleanupIdx === 1 ? "full" : "basic";

      const { filename } = await generatePdf("/api/host/generate/contract", {
        club_name:  data.clubName,
        date:       formatDateISO(data.eventDate),  // "May 5, 2026"
        start_time: data.startTime,
        end_time:   data.endTime,
        price:      rentalPrice,
        deposit:    depositAmount,
        max_guests: maxGuests,
        monitors:   data.monitors,
        cleanup_tier: cleanupTier,
        areas:      selectedAreas,
        cleared:    clearedMap,
        guest_list:      data.guestList,
        sound_system:    data.soundSystem,
        lighting_system: data.lightingSystem,
        sign,
      });
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

  const txt = <K extends keyof typeof data>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update(k, e.target.value as never);

  const eventDateReadable = data.eventDate ? formatDateISO(data.eventDate) : "";

  return (
    <form onSubmit={submit} className="space-y-8">
      <div>
        <StepIndicator current="contract" />
        <h1 className="page-title mt-6">Hosting Contract</h1>
        <p className="page-lede">
          Fill in the event details. Organization, event date, and (when available) rental fee
          and deposit are auto-filled from the previous steps.
        </p>
      </div>

      {/* ── Renter & Event ── */}
      <section className="card">
        <div className="card-header"><span className="card-title">Renter & Event</span></div>
        <div className="card-body grid gap-5 sm:grid-cols-2">
          <Field label="Organization">
            <input className="field-input" required placeholder="e.g. Pi Sigma Delta"
              value={hydrated ? data.clubName : ""} onChange={txt("clubName")} autoComplete="off" />
          </Field>
          <Field
            label="Event Date"
            hint={eventDateReadable ? `Will print as: ${eventDateReadable}` : undefined}
          >
            <input type="date" className="field-input" required
              value={hydrated ? data.eventDate : ""} onChange={txt("eventDate")} />
          </Field>
          <Field label="Start Time (24h)">
            <input className="field-input" required pattern="\d{1,2}:\d{2}" placeholder="e.g. 22:00"
              value={hydrated ? data.startTime : ""} onChange={txt("startTime")} autoComplete="off" />
          </Field>
          <Field label="End Time (24h)">
            <input className="field-input" required pattern="\d{1,2}:\d{2}" placeholder="e.g. 02:00"
              value={hydrated ? data.endTime : ""} onChange={txt("endTime")} autoComplete="off" />
          </Field>
        </div>
      </section>

      {/* ── Money + Capacity (side by side) ── */}
      <div className="grid gap-8 md:grid-cols-2">
        <section className="card">
          <div className="card-header"><span className="card-title">Fees</span></div>
          <div className="card-body grid gap-5">
            <DerivedField
              label="Rental Fee (USD)"
              okey="rentalPrice"
              placeholder="e.g. 1500"
              source="the negotiated price on the pricing step"
              emptyHint="Set a negotiated price on the pricing step to auto-fill this."
            />
            <DerivedField
              label="Security Deposit (USD)"
              okey="depositAmount"
              placeholder="e.g. 100"
              source={
                typeof data.pricingBreakdown?.depositRate === "number"
                  ? `the calculator (${Math.round(data.pricingBreakdown.depositRate * 100)}% of total)`
                  : "the calculator's suggested deposit"
              }
              emptyHint="Set a negotiated price on the pricing step to auto-fill this."
            />
          </div>
        </section>

        <section className="card">
          <div className="card-header"><span className="card-title">Capacity & Monitors</span></div>
          <div className="card-body grid gap-5">
            <DerivedField
              label="Maximum Guests"
              okey="maxGuests"
              placeholder="e.g. 150"
              min={1}
              max={200}
              source="the guest count on the event details step"
              emptyHint="Set a guest count on the event details step to auto-fill this."
              extraHint={parseInt(maxGuests) > 50
                ? "Over 50 guests triggers a required $125 fire permit fee."
                : "Up to 50 guests; over 50 requires a $125 fire permit."}
            />
            <Field label="Sober Monitors">
              <input className="field-input" type="number" min={0} required
                placeholder="e.g. 4"
                value={hydrated ? data.monitors : ""} onChange={txt("monitors")} />
            </Field>
          </div>
        </section>
      </div>

      {/* ── Allowed Areas ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Allowed Areas</span>
          <span className="card-subtitle">Spaces guests may access during the event.</span>
        </div>
        <div className="card-body">
          <p className="text-[12.5px] text-muted mb-4 max-w-2xl leading-relaxed">
            For each enabled area, optionally have Theta Xi clear furniture beforehand —
            otherwise the renter is responsible for restoring moved items to their original
            positions before the rental period ends.
          </p>
          <div className="grid gap-x-8 sm:grid-cols-3">
            {AREAS.map(a => {
              const enabled = !!data.areas[a.key];
              return (
                <div key={a.key} className="border-t border-rule pt-3 sm:border-t-0 sm:pt-0">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={hydrated ? enabled : false}
                      onChange={e => setArea(a.key, e.target.checked)}
                    />
                    <span className="font-semibold text-[14px]">{a.label}</span>
                  </label>
                  <label className={"check-row pl-6 text-muted " + (enabled ? "" : "disabled")}>
                    <input
                      type="checkbox"
                      disabled={!enabled}
                      checked={hydrated ? !!data.cleared[a.key] : false}
                      onChange={e => setCleared(a.key, e.target.checked)}
                    />
                    <span className="text-[12px] leading-snug">
                      Theta Xi clears beforehand ({a.clearedDesc})
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Guest List ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Guest List</span>
          <span className="card-subtitle">Optional advance roster for security review.</span>
        </div>
        <div className="card-body">
          <p className="text-[12.5px] text-muted mb-3 max-w-2xl leading-relaxed">
            When required, the organization must submit a written guest list at least 5 days
            before the event start time. Theta Xi reviews the list ahead of the event.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={hydrated ? data.guestList : false}
              onChange={e => update("guestList", e.target.checked)}
            />
            <span className="text-[14px]">
              Require guest list 5 days in advance
            </span>
          </label>
        </div>
      </section>

      {/* ── Amenities ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Amenities</span>
          <span className="card-subtitle">Theta Xi sets up any selected amenities before the event.</span>
        </div>
        <div className="card-body grid gap-1 sm:grid-cols-2">
          <label className="check-row">
            <input
              type="checkbox"
              checked={hydrated ? data.soundSystem : false}
              onChange={e => update("soundSystem", e.target.checked)}
            />
            <span className="text-[14px]">Sound system</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={hydrated ? data.lightingSystem : false}
              onChange={e => update("lightingSystem", e.target.checked)}
            />
            <span className="text-[14px]">Lighting system</span>
          </label>
        </div>
      </section>

      {/* ── Auto-sign ── */}
      <section className="card">
        <div className="card-header">
          <span className="card-title">Execution</span>
          <span className="card-subtitle">Optionally pre-sign the Theta Xi side.</span>
        </div>
        <div className="card-body">
          <p className="text-[12.5px] text-muted mb-3 max-w-2xl leading-relaxed">
            When enabled, the contract is generated with the Theta Xi Executive Board signature
            and today&rsquo;s date already filled in. The renter&rsquo;s side is left blank.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={sign}
              onChange={e => setSign(e.target.checked)}
            />
            <span className="text-[14px]">Auto-sign Theta Xi side with today&rsquo;s date</span>
          </label>
        </div>
      </section>

      {/* ── Submit + step nav ── */}
      <div className="flex items-center justify-between gap-6 flex-wrap pt-2 border-t border-rule">
        <div className="flex-1 min-w-[200px] pt-4">
          {error && <p className="text-warn text-[13px]">{error}</p>}
          {success && <p className="text-ok text-[13px]">{success}</p>}
        </div>
        <button type="submit" disabled={busy || !hydrated} className="btn-primary mt-4">
          {busy ? "Generating…" : "Generate Contract"}
        </button>
      </div>

      <StepNav current="contract" />
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/**
 * A numeric field that follows an earlier step until the user types over it.
 *
 * The hint always states the field's actual provenance — tracking, manually
 * set, or diverged from its source — so a number here is never silently stale.
 * Diverged fields get a one-click link back to the live value.
 */
function DerivedField({
  label, okey, placeholder, source, emptyHint, extraHint, min = 0, max,
}: {
  label: string;
  okey: OverrideKey;
  placeholder: string;
  /** Where the automatic value comes from, as a sentence fragment. */
  source: string;
  /** Shown when there's no automatic value to fall back to. */
  emptyHint: string;
  /** Domain note appended regardless of provenance (e.g. the fire permit rule). */
  extraHint?: string;
  min?: number;
  max?: number;
}) {
  const { hydrated, data, setDerived, resetDerived } = useSharedData();

  const value    = hydrated ? effective(data, okey) : "";
  const auto     = autoValue(data, okey);
  const isManual = data.overrides[okey];
  const diverged = hasDiverged(data, okey);

  const provenance = !hydrated ? null
    : diverged && auto ? <>Overridden — auto value is <strong className="text-ink">{auto}</strong>.{" "}</>
    : isManual         ? <>Set manually.{" "}</>
    : auto             ? <>Auto-filled from {source}.</>
    : <>{emptyHint}</>;

  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        type="number"
        min={min}
        max={max}
        required
        placeholder={placeholder}
        value={value}
        onChange={e => setDerived(okey, e.target.value)}
      />
      <p className="field-hint">
        {provenance}
        {hydrated && isManual && auto && (
          <button type="button" className="btn-link" onClick={() => resetDerived(okey)}>
            Reset to auto
          </button>
        )}
        {extraHint && <span className="block">{extraHint}</span>}
      </p>
    </div>
  );
}
