"use client";

import { Button } from "@/components/brand/button";
import { isMultiClub } from "@/lib/host-clubs";
import { autoValue, effective, hasDiverged } from "@/lib/host-derive";
import { useSharedData } from "@/lib/host-shared-state";

/**
 * "Event Details" block. The single source of truth for the renting
 * organization(s), event date, and guest counts. Later steps (pricing,
 * contract, documents) read these values but cannot change them — they show
 * them read-only with a link back here.
 *
 * Multi-organization events: add one row per organization. The contract
 * introduces them as "Club 1", "Club 2", … and refers to them collectively
 * as "the Renter".
 */
export default function SharedDataForm({ compact = false }: { compact?: boolean }) {
  const { data, update, hydrated, setDerived, resetDerived } = useSharedData();

  // Always render at least one row, even before anything has been entered.
  const clubs = data.clubs.length > 0 ? data.clubs : [""];
  const multi = isMultiClub(clubs);

  function setClub(i: number, v: string) {
    const next = [...clubs];
    next[i] = v;
    update("clubs", next);
  }
  function addClub() {
    update("clubs", [...clubs, ""]);
  }
  function removeClub(i: number) {
    update("clubs", clubs.filter((_, j) => j !== i));
  }

  const maxGuestsShown    = hydrated ? effective(data, "maxGuests") : "";
  const maxGuestsAuto     = autoValue(data, "maxGuests");
  const maxGuestsManual   = data.overrides.maxGuests;
  const maxGuestsDiverged = hasDiverged(data, "maxGuests");

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Event Details</span>
        {!compact && (
          <span className="card-subtitle">
            Reused across the pricing, contract, and documents steps.
          </span>
        )}
      </div>
      <div className="card-body space-y-5">
        {/* ── Organizations ── */}
        <div>
          <label className="field-label">
            {clubs.length > 1 ? "Organizations" : "Organization"}
          </label>
          <div className="space-y-2 max-w-xl">
            {clubs.map((club, i) => {
              // The contract numbers only the names that survive cleaning,
              // so the badge counts non-blank rows, not raw positions —
              // otherwise a blank middle row makes the labels lie about the
              // "Club N" each organization will sign as.
              const contractNumber = club.trim()
                ? clubs.slice(0, i).filter(c => c.trim()).length + 1
                : null;
              return (
              <div key={i} className="flex items-center gap-2">
                {clubs.length > 1 && (
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted w-[46px] shrink-0 text-right"
                    title="How the contract introduces this organization"
                  >
                    {contractNumber ? `Club ${contractNumber}` : ""}
                  </span>
                )}
                <input
                  className="field-input flex-1"
                  placeholder={i === 0 ? "e.g. Pi Sigma Delta" : "e.g. Another Club"}
                  value={hydrated ? club : ""}
                  onChange={e => setClub(i, e.target.value)}
                  autoComplete="off"
                />
                {clubs.length > 1 && (
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => removeClub(i)}
                    title="Remove this organization"
                  >
                    ✕
                  </Button>
                )}
              </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <Button type="button" variant="text" onClick={addClub}>
              + Add another organization
            </Button>
          </div>
          {multi && (
            <p className="field-hint mt-2">
              Joint event — the contract introduces each organization as Club&nbsp;1,
              Club&nbsp;2, … and refers to them together as &ldquo;the Renter&rdquo;. Each
              organization signs separately.
            </p>
          )}
        </div>

        {/* ── Date + guests ── */}
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="shared-date">Event Date</label>
            <input
              id="shared-date"
              type="date"
              className="field-input"
              value={hydrated ? data.eventDate : ""}
              onChange={e => update("eventDate", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="shared-guests">Estimated Guests</label>
            <input
              id="shared-guests"
              type="number"
              min={0}
              max={500}
              className="field-input"
              placeholder="e.g. 80"
              value={hydrated ? data.numGuests : ""}
              onChange={e => update("numGuests", e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="shared-max-guests">Maximum Guests</label>
            <input
              id="shared-max-guests"
              type="number"
              min={1}
              max={500}
              className="field-input"
              placeholder={maxGuestsAuto || "e.g. 150"}
              value={maxGuestsShown}
              onChange={e => setDerived("maxGuests", e.target.value)}
              autoComplete="off"
            />
            <p className="field-hint">
              {maxGuestsDiverged && maxGuestsAuto ? (
                <>
                  Overridden — the estimate is {maxGuestsAuto}.{" "}
                  <Button type="button" variant="text" onClick={() => resetDerived("maxGuests")}>
                    Reset
                  </Button>
                </>
              ) : maxGuestsManual ? (
                <>
                  Set manually.{" "}
                  <Button type="button" variant="text" onClick={() => resetDerived("maxGuests")}>
                    Reset to estimate
                  </Button>
                </>
              ) : (
                "Tracks the estimated guest count unless you set a different contractual cap."
              )}
              {parseInt(maxGuestsShown) > 50 && (
                <span className="block">Over 50 guests triggers a required $125 fire permit fee.</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
