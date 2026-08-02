"use client";

import { useSharedData } from "@/lib/host-shared-state";

/**
 * "Event Details" block. The single source of truth for organization
 * name, event date, and number of guests. Renders on `/host` and at the
 * top of `/host/invoice`; pages /host/contract and /host/pricing read these
 * same fields inline as part of their own forms.
 */
export default function SharedDataForm({ compact = false }: { compact?: boolean }) {
  const { data, update, hydrated } = useSharedData();

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Event Details</span>
        {!compact && (
          <span className="card-subtitle">
            Reused across the contract, pricing, and invoice pages.
          </span>
        )}
      </div>
      <div className="card-body grid gap-5 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="shared-club">Organization</label>
          <input
            id="shared-club"
            className="field-input"
            placeholder="e.g. Pi Sigma Delta"
            value={hydrated ? data.clubName : ""}
            onChange={e => update("clubName", e.target.value)}
            autoComplete="off"
          />
        </div>
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
      </div>
    </section>
  );
}
