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

  return <section className="min-w-0">
    <h2 className="text-lg font-semibold">Event details</h2>
    {!hasAnything ? <p className="mt-3 text-[13px] text-muted">No saved event details.</p> : <dl className="mt-3 space-y-2 text-[13px]">
      {[
        ["Time", `${formatTime(startTime) ?? "—"} – ${formatTime(endTime) ?? "—"}`],
        ["Guests", maxGuests ?? "—"],
        ["Sober monitors", monitors ?? "—"],
        ["Areas", selectedAreas.map(k => `${AREA_LABELS[k]}${cleared[k] ? " (cleared by Theta Xi)" : ""}`).join(", ") || "None"],
        ["Guest list", guestList ? "Required" : "Not required"],
        ["Sound system", soundSystem ? "Included" : "Not included"],
        ["Lighting", lightingSystem ? "Included" : "Not included"],
      ].map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}
    </dl>}
  </section>;
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
