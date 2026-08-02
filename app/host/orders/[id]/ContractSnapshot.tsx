/**
 * Read-only rendering of the contract-relevant fields inside
 * `order.snapshot` — the terms agreed when this order was saved. Same
 * defensive reading as PricingSnapshot: `snapshot` is `Record<string,
 * unknown>` and an older order may be missing any of these fields.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function boolRecord(v: unknown): Record<string, boolean> {
  return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
}

const AREA_LABELS: Record<string, string> = {
  living_room: "Living Room",
  dining_room: "Dining Room",
  backyard: "Backyard",
};

export default function ContractSnapshot({ snapshot }: { snapshot: Record<string, unknown> }) {
  const startTime  = str(snapshot.startTime);
  const endTime    = str(snapshot.endTime);
  const maxGuests  = str(snapshot.maxGuests);
  const monitors   = str(snapshot.monitors);
  const areas      = boolRecord(snapshot.areas);
  const cleared    = boolRecord(snapshot.cleared);
  const guestList      = bool(snapshot.guestList);
  const soundSystem    = bool(snapshot.soundSystem);
  const lightingSystem = bool(snapshot.lightingSystem);

  const selectedAreas = Object.keys(AREA_LABELS).filter(k => areas[k]);
  const hasAnything = Boolean(startTime || endTime || maxGuests || monitors || selectedAreas.length);

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Contract Terms Snapshot</span>
        <span className="card-subtitle">As agreed when this order was saved.</span>
      </div>
      <div className="card-body space-y-5">
        {!hasAnything ? (
          <p className="text-[13px] text-muted">No contract terms were saved with this order.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <SnapshotField label="Start time"      value={startTime} />
              <SnapshotField label="End time"        value={endTime} />
              <SnapshotField label="Max guests"      value={maxGuests} />
              <SnapshotField label="Sober monitors"  value={monitors} />
            </div>

            <div>
              <p className="field-label">Allowed Areas</p>
              {selectedAreas.length === 0 ? (
                <p className="text-[13px] text-muted">None selected.</p>
              ) : (
                <ul className="text-[13px] text-ink space-y-1">
                  {selectedAreas.map(k => (
                    <li key={k}>
                      {AREA_LABELS[k]}
                      {cleared[k] && (
                        <span className="text-muted"> — cleared by Theta Xi beforehand</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <span className={guestList ? "text-ink" : "text-muted"}>
                {guestList ? "✓" : "—"}&nbsp; Guest list required
              </span>
              <span className={soundSystem ? "text-ink" : "text-muted"}>
                {soundSystem ? "✓" : "—"}&nbsp; Sound system
              </span>
              <span className={lightingSystem ? "text-ink" : "text-muted"}>
                {lightingSystem ? "✓" : "—"}&nbsp; Lighting system
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SnapshotField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[13.5px] text-ink tabular-nums">{value ?? "—"}</p>
    </div>
  );
}
