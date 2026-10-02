"use client";

import { Button } from "@/components/brand/button";
import { isMultiClub, normalizeOrgName } from "@/lib/host-clubs";
import { useSharedData } from "@/lib/host-shared-state";
import RepresentativeFields from "./RepresentativeFields";

/**
 * "Event Details" block. The single source of truth for the renting
 * organization(s), event date, and guest counts. Later steps (pricing,
 * contract, documents) read these values but cannot change them — they show
 * them read-only with a link back here.
 *
 * Multi-organization events: add one row per organization. The contract
 * introduces them as "Organization 1", "Organization 2", … and refers to
 * them collectively as "the Renter".
 */
export default function SharedDataForm({ compact = false }: { compact?: boolean }) {
  const { data, update, hydrated } = useSharedData();

  // Always render at least one row, even before anything has been entered.
  const clubs = data.clubs.length > 0 ? data.clubs : [""];
  const multi = isMultiClub(clubs);

  function setClub(i: number, v: string) {
    const previous = normalizeOrgName(clubs[i]);
    const next = [...clubs];
    next[i] = v;
    update("clubs", next);
    update("contractSigners", data.contractSigners.map(person => (person.clubSlot !== undefined ? person.clubSlot === i : !!previous && normalizeOrgName(person.club) === previous) ? { ...person, club: normalizeOrgName(v), clubSlot: i } : person));
  }
  function addClub() {
    update("clubs", [...clubs, ""]);
  }
  function removeClub(i: number) {
    const name = normalizeOrgName(clubs[i]);
    const belongs = (person: typeof data.contractSigners[number]) => person.clubSlot !== undefined ? person.clubSlot === i : normalizeOrgName(person.club) === name;
    if (data.contractSigners.some(belongs) && !window.confirm(`Remove ${clubs[i]} and its representatives from this draft?`)) return;
    update("clubs", clubs.filter((_, j) => j !== i));
    update("contractSigners", data.contractSigners.filter(person => !belongs(person)).map(person => person.clubSlot !== undefined && person.clubSlot > i ? { ...person, clubSlot: person.clubSlot - 1 } : person));
  }

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Event Details</span>
        {!compact && (
          <span className="card-subtitle">
            Add each organization and the people who will sign for it.
          </span>
        )}
      </div>
      <div className="card-body space-y-5">
        {/* ── Organizations ── */}
        <div>
          <label className="field-label">
            {clubs.length > 1 ? "Organizations" : "Organization"}
          </label>
          <div className="divide-y divide-rule">
            {clubs.map((club, i) => {
              // The contract numbers only the names that survive cleaning,
              // so the badge counts non-blank rows, not raw positions —
              // otherwise a blank middle row makes the labels lie about the
              // "Organization N" each organization will sign as.
              const contractNumber = club.trim()
                ? clubs.slice(0, i).filter(c => c.trim()).length + 1
                : null;
              return (
              <div key={i} className="py-5 first:pt-0 last:pb-0"><div className="flex items-center gap-2 max-w-xl">
                {clubs.length > 1 && (
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted w-[46px] shrink-0 text-right"
                    title="How the contract introduces this organization"
                  >
                    {contractNumber ? `Org ${contractNumber}` : ""}
                  </span>
                )}
                <input
                  className="field-input flex-1"
                  placeholder={i === 0 ? "e.g. Pi Sigma Delta" : "e.g. Another Club"}
                  value={hydrated ? club : ""}
                  onChange={e => setClub(i, e.target.value)}
                  onBlur={e => {
                    // Tidy casing/whitespace so the printed contract never
                    // shows an all-lowercase organization name.
                    const v = normalizeOrgName(e.target.value);
                    if (v !== e.target.value) setClub(i, v);
                  }}
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
              </div><RepresentativeFields data={data} update={update} club={club} clubSlot={i} /></div>
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
              Joint event — the contract introduces each organization as
              Organization&nbsp;1, Organization&nbsp;2, … and refers to them together as
              &ldquo;the Renter&rdquo;. Each organization signs separately.
            </p>
          )}
        </div>

        {/* ── Date + guests ── */}
        <div className="grid gap-5 sm:grid-cols-2">
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
            <label className="field-label" htmlFor="shared-guests">Maximum Guests</label>
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
            {parseInt(data.numGuests, 10) > 50 && (
              <p className="field-hint">Over 50 guests triggers a required $125 fire permit fee.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
