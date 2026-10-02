"use client";
import { ButtonLink } from "@/components/brand/button";

import { AreaKey, useSharedData } from "@/lib/host-shared-state";
import { effective, effectiveRentalPrice, liveBreakdown } from "@/lib/host-derive";
import { cleanClubs, clubsDisplay, isMultiClub } from "@/lib/host-clubs";
import { formatDateISO } from "@/lib/host-format";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import ChapterSigningFields from "@/components/host/ChapterSigningFields";

const AREAS: { key: AreaKey; label: string; clearedDesc: string }[] = [
  { key: "living_room", label: "Living Room", clearedDesc: "the couches, tables, and carpet" },
  { key: "dining_room", label: "Dining Room", clearedDesc: "the dining table and chairs" },
  { key: "backyard",    label: "Backyard",    clearedDesc: "everything off the cement area in the center" },
];

export default function ContractPage() {
  const { hydrated, data, update } = useSharedData();

  // Values agreed on earlier steps are shown read-only here — the contract
  // step can't renegotiate the price, swap the organization, or move the
  // date. Each one links back to the step that owns it.
  const clubs        = cleanClubs(data.clubs);
  const clubsText    = clubsDisplay(data.clubs);
  const rentalPrice  = hydrated ? effectiveRentalPrice(data) : "";
  const deposit      = hydrated ? effective(data, "depositAmount") : "";
  const maxGuests    = hydrated ? effective(data, "maxGuests") : "";
  const depositRate  = liveBreakdown(data)?.depositRate;

  function setArea(key: AreaKey, on: boolean) {
    update("areas", { ...data.areas, [key]: on });
    if (!on) update("cleared", { ...data.cleared, [key]: false });
  }
  function setCleared(key: AreaKey, on: boolean) {
    update("cleared", { ...data.cleared, [key]: on });
  }

  const txt = <K extends keyof typeof data>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update(k, e.target.value as never);

  const eventDateReadable = data.eventDate ? formatDateISO(data.eventDate) : "";

  return (
    <div className="space-y-8">
      <div>
        <StepIndicator current="contract" />
        <h1 className="page-title mt-6">Contract terms</h1>
        <p className="page-lede">
          Fill in the event logistics. Organization, date, price, and capacity were set on the
          previous steps and are shown here for reference — follow the links to change them.
        </p>
      </div>

      {/* ── Renter & Event ── */}
      <section className="card">
        <div className="card-header"><span className="card-title">Renter & Event</span></div>
        <div className="card-body grid gap-5 sm:grid-cols-2">
          <LockedField
            label={clubs.length > 1 ? "Organizations" : "Organization"}
            value={clubsText}
            href="/host"
            source="the Event Details step"
            emptyHint="Set on the Event Details step."
          >
            {isMultiClub(data.clubs) && (
              <span className="block mt-1">
                {clubs.map((c, i) => `Organization ${i + 1}: ${c}`).join(" · ")} — referred to
                together as &ldquo;the Renter&rdquo;.
              </span>
            )}
          </LockedField>
          <LockedField
            label="Event Date"
            value={eventDateReadable}
            href="/host"
            source="the Event Details step"
            emptyHint="Set on the Event Details step."
          />
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
            <LockedField
              label="Rental Fee (USD)"
              value={rentalPrice}
              href="/host/pricing"
              source="the negotiated price on the Pricing step"
              emptyHint="Set a negotiated price on the Pricing step to fill this."
            />
            <LockedField
              label="Security Deposit (USD)"
              value={deposit}
              href="/host/pricing"
              source={
                typeof depositRate === "number"
                  ? `the Pricing step (${Math.round(depositRate * 100)}% of total)`
                  : "the Pricing step"
              }
              emptyHint="Set a negotiated price on the Pricing step to fill this."
            />
          </div>
        </section>

        <section className="card">
          <div className="card-header"><span className="card-title">Capacity & Monitors</span></div>
          <div className="card-body grid gap-5">
            <LockedField
              label="Maximum Guests"
              value={maxGuests}
              href="/host"
              source="the Event Details step"
              emptyHint="Set a guest count on the Event Details step to fill this."
            >
              {parseInt(maxGuests) > 50 && (
                <span className="block mt-1">
                  Over 50 guests triggers a required $125 fire permit fee.
                </span>
              )}
            </LockedField>
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

      <section className="card">
        <div className="card-header"><h2 className="card-title">Theta Xi signature</h2></div>
        <div className="card-body"><ChapterSigningFields data={data} update={update} /></div>
      </section>
      <StepNav current="contract" />
    </div>
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
 * A value owned by an earlier step, shown read-only. The contract step can
 * look but not touch — changing it means going back to the step where it was
 * agreed, so the number on the signed PDF always matches what that step shows.
 */
function LockedField({
  label, value, href, source, emptyHint, children,
}: {
  label: string;
  value: string;
  /** Where the value is edited. */
  href: string;
  /** Where the value comes from, as a sentence fragment. */
  source: string;
  /** Shown when there's no value yet. */
  emptyHint: string;
  children?: React.ReactNode;
}) {
  const { hydrated } = useSharedData();
  const shown = hydrated ? value : "";

  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="field-input bg-canvas flex items-center justify-between gap-3">
        <span className={"tabular-nums truncate " + (shown ? "" : "text-muted")}>
          {shown || "—"}
        </span>
        <ButtonLink href={href} variant="text" className="shrink-0">
          Change
        </ButtonLink>
      </div>
      <p className="field-hint">
        {shown ? <>Set on {source}.</> : emptyHint}
        {children}
      </p>
    </div>
  );
}
