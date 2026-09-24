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
      </div>
      <div className="card-body space-y-6">
        {!hasAnything ? (
          <p className="text-[13px] text-muted">No contract terms were saved with this order.</p>
        ) : (
          <>
            <div className="grid gap-px border border-rule bg-rule sm:grid-cols-4">
              <SnapshotStat label="Start time"     value={formatTime(startTime)} />
              <SnapshotStat label="End time"       value={formatTime(endTime)} />
              <SnapshotStat label="Max guests"     value={maxGuests} />
              <SnapshotStat label="Sober monitors" value={monitors} />
            </div>

            <div>
              <p className="field-label mb-2.5">Allowed areas</p>
              {selectedAreas.length === 0 ? (
                <p className="text-[13px] text-muted">None selected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedAreas.map(k => (
                    <span key={k} className="inline-flex items-center gap-2 border border-rule bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink">
                      {AREA_LABELS[k]}
                      {cleared[k] && <span className="badge badge-verified">Cleared by Theta Xi</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-rule pt-5">
              <p className="field-label mb-2.5">Requirements &amp; add-ons</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <FeatureRow label="Guest list"      enabled={guestList}      enabledText="Required" enabledVariant="badge-verified" />
                <FeatureRow label="Sound system"    enabled={soundSystem}    enabledText="Included" enabledVariant="badge-approved" />
                <FeatureRow label="Lighting system" enabled={lightingSystem} enabledText="Included" enabledVariant="badge-approved" />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** "19:00" → "7:00 PM"; passes through anything unexpected. */
function formatTime(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = parseInt(m[1], 10);
  if (h > 23) return value;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${period}`;
}

function SnapshotStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="field-label">{label}</p>
      <p className="mt-1.5 text-[17px] font-semibold text-ink tabular-nums">{value ?? "—"}</p>
    </div>
  );
}

function FeatureRow({ label, enabled, enabledText, enabledVariant }: {
  label: string;
  enabled: boolean;
  enabledText: string;
  enabledVariant: "badge-approved" | "badge-verified";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-rule px-3.5 py-2.5">
      <span className="text-[12.5px] font-semibold text-ink">{label}</span>
      {enabled
        ? <span className={`badge ${enabledVariant}`}>{enabledText}</span>
        : <span className="badge border-rule text-muted">None</span>}
    </div>
  );
}
