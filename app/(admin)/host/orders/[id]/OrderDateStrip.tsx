"use client";

import { useId, useRef, useState } from "react";
import { relativeTimelineDate, timelineDateGroups, timelineDay, type TimelineDate } from "@/lib/host-timeline";

export default function OrderDateStrip({ dates, undated, today, endDate }: { dates: TimelineDate[]; undated: { label: string; detail: string }[]; today: string; endDate: string }) {
  const [selection, setSelection] = useState<{ day: number | null; offset: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const groups = timelineDateGroups(dates);
  const dayWidth = 64;
  const firstDay = groups[0][0];
  const dayCount = Math.max(1, Math.max(groups.at(-1)![0], timelineDay(endDate)!) - firstDay);
  const selected = selection?.day === null ? undated : groups.find(([day]) => day === selection?.day)?.[1];

  function showDetails(day: number | null, button: HTMLButtonElement) {
    const bounds = button.getBoundingClientRect();
    const offset = bounds.left + bounds.width / 2 - strip.current!.getBoundingClientRect().left;
    setSelection({ day, offset });
  }

  return <div ref={strip} className="relative mb-3" onMouseLeave={() => setSelection(null)} onKeyDown={event => { if (event.key === "Escape") setSelection(null); }}>
    <p className="mb-2 text-[11px] text-muted">Key dates · One tick per day · Scroll for more</p>
    <div aria-label="Key event dates" className="flex overflow-x-auto pt-1 pb-2" onScroll={event => {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && event.currentTarget.contains(focused)) {
        showDetails(focused.dataset.day ? Number(focused.dataset.day) : null, focused);
        return;
      }
      setSelection(null);
    }}>
      <div className="relative min-h-36 flex-1 border-t border-rule" style={{ minWidth: (dayCount + 1) * dayWidth }}>
      {Array.from({ length: dayCount + 1 }, (_, day) => <span key={day} aria-hidden="true" className="absolute top-0 h-1.5 border-l border-rule" style={{ left: day * dayWidth + 12 }} />)}
      {groups.map(([day, entries]) => <button key={day} data-day={day} type="button" aria-label={entries.map(entry => `${entry.label}: ${entry.detail} · ${relativeTimelineDate(entry.date, today)}`).join("; ")} aria-describedby={selection?.day === day ? tooltipId : undefined}
        className="absolute top-0 min-h-32 w-16 px-2 pt-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        style={{ left: (day - firstDay) * dayWidth }}
        onMouseEnter={event => showDetails(day, event.currentTarget)} onFocus={event => showDetails(day, event.currentTarget)} onClick={event => showDetails(day, event.currentTarget)} onBlur={() => setSelection(null)}>
        <span aria-hidden="true" className={`absolute -top-1 left-2 h-2 w-2 rounded-full border border-brand ${entries.some(entry => entry.label === "Now") ? "bg-brand" : "bg-surface"}`} />
        <span className="block text-[12px] font-semibold text-ink">{new Date(day * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}{entries.some(entry => entry.label === "Now") ? " · Today" : ""}</span>
        <span className="mt-1 block text-[11px] leading-snug text-muted">{entries.find(entry => entry.label !== "Now")?.label ?? "Today"}{entries.length > 1 ? ` · ${entries.length - 1} more` : ""}</span>
      </button>)}
      </div>
      {undated.length > 0 && <button type="button" aria-label="Milestones with no date" aria-describedby={selection?.day === null ? tooltipId : undefined}
        className="relative min-h-20 w-36 shrink-0 border-t border-dashed border-rule px-2 pt-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        onMouseEnter={event => showDetails(null, event.currentTarget)} onFocus={event => showDetails(null, event.currentTarget)} onClick={event => showDetails(null, event.currentTarget)} onBlur={() => setSelection(null)}>
        <span aria-hidden="true" className="absolute -top-1 left-2 h-2 w-2 rounded-full border border-dashed border-brand bg-surface" />
        <span className="block text-[12px] font-semibold text-ink">No date</span>
        <span className="mt-1 block text-[11px] text-muted">{undated.length} milestones</span>
      </button>}
    </div>
    {selected && <div id={tooltipId} role="tooltip" style={{ left: `clamp(0px, ${selection!.offset}px, max(0px, calc(100% - 280px)))` }} className="absolute top-full z-20 w-[280px] max-w-full max-h-72 overflow-y-auto space-y-2 rounded border border-rule bg-surface px-3 py-2 text-[12px] text-ink shadow-sm">
      {selection?.day === null && <p className="font-semibold">No date</p>}
      {selected.map(entry => <div key={entry.label}><p className="font-semibold">{entry.label}</p><p>{entry.detail}</p>{"date" in entry && <p className="text-muted">{relativeTimelineDate(entry.date as string, today)} · Pacific Time</p>}</div>)}
    </div>}
  </div>;
}
