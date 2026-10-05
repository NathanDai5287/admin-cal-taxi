/**
 * Read-only rendering of the contract-relevant fields inside
 * `order.snapshot` — the terms agreed when this order was saved. Same
 * defensive reading as PricingSnapshot: `snapshot` is `Record<string,
 * unknown>` and an older order may be missing any of these fields.
 */

import OrderIcon from "@/components/host/OrderIcon";

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
    {!hasAnything ? <p className="mt-3 text-[13px] text-muted">No saved event details.</p> : <>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 text-[13px]">
        <div className="col-span-2 flex items-center gap-3"><OrderIcon name="clock" className="h-5 w-5 text-brand" /><div><dt className="text-[12px] text-muted">Time</dt><dd className="mt-0.5 font-medium tabular-nums">{formatTime(startTime) ?? "—"} – {formatTime(endTime) ?? "—"}</dd></div></div>
        <div className="flex items-center gap-3"><OrderIcon name="users" className="h-5 w-5 text-brand" /><div><dt className="text-[12px] text-muted">Guests</dt><dd className="mt-0.5 font-medium tabular-nums">{maxGuests ?? "—"}</dd></div></div>
        <div className="flex items-center gap-3"><OrderIcon name="shield" className="h-5 w-5 text-brand" /><div><dt className="text-[12px] text-muted">Sober monitors</dt><dd className="mt-0.5 font-medium tabular-nums">{monitors ?? "—"}</dd></div></div>
        <div className="col-span-2 flex items-start gap-3"><OrderIcon name="location" className="mt-0.5 h-5 w-5 text-brand" /><div><dt className="text-[12px] text-muted">Areas</dt><dd className="mt-1"><ul className="space-y-1">{selectedAreas.length ? selectedAreas.map(k => <li key={k} className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium">{AREA_LABELS[k]}</span>{cleared[k] && <span className="text-[11px] text-muted">Cleared by Theta Xi</span>}</li>) : <li>None</li>}</ul></dd></div></div>
      </dl>
      <ul className="mt-4 flex flex-wrap gap-2 text-[11px]">{[
        { icon: "list", label: "Guest list", enabled: guestList, yes: "required", no: "not required" },
        { icon: "sound", label: "Sound", enabled: soundSystem, yes: "included", no: "not included" },
        { icon: "light", label: "Lighting", enabled: lightingSystem, yes: "included", no: "not included" },
      ].map(item => <li key={item.label} className={`flex items-center gap-1.5 px-2 py-1.5 ${item.enabled ? "bg-ok-light text-ok" : "bg-surface text-muted"}`}><OrderIcon name={item.icon as "list" | "sound" | "light"} className="h-3.5 w-3.5" />{item.label} {item.enabled ? item.yes : item.no}</li>)}</ul>
    </>}
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
