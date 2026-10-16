"use client";

import { useId, useRef, useState } from "react";
import { relativeTimelineDate, timelineDateGroups, timelineDay, type TimelineDate } from "@/lib/host-timeline";

export default function OrderDateStrip({ dates, undated, today, endDate }: { dates: TimelineDate[]; undated: { label: string; detail: string }[]; today: string; endDate: string }) {
  const [selection, setSelection] = useState<{ day: number | null; offset: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const groups = timelineDateGroups(dates);
  const firstDay = groups[0][0];
  const dayCount = Math.max(1, Math.max(groups.at(-1)![0], timelineDay(endDate)!) - firstDay);
  const selected = selection?.day === null ? undated : groups.find(([day]) => day === selection?.day)?.[1];

  function showDetails(day: number | null, button: HTMLButtonElement) {
    const bounds = button.getBoundingClientRect();
    const offset = bounds.left + bounds.width / 2 - strip.current!.getBoundingClientRect().left;
    setSelection({ day, offset });
  }

  return <div ref={strip} className="relative mb-3" onMouseLeave={() => setSelection(null)} onKeyDown={event => { if (event.key === "Escape") setSelection(null); }}>
    <div className="flex items-start gap-3">
    <div aria-label="Event dates; each tick is one day" className="min-w-0 flex-1 overflow-x-auto px-3" onScroll={event => {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && event.currentTarget.contains(focused)) {
        showDetails(Number(focused.dataset.day), focused);
        return;
      }
      setSelection(null);
    }}>
      <div className="relative h-10" style={{ minWidth: dayCount * 24 }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-10 w-full text-rule" viewBox={`0 0 ${dayCount} 40`} preserveAspectRatio="none">
          <path d={`M0 20H${dayCount}`} stroke="currentColor" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: dayCount + 1 }, (_, day) => <path key={day} d={`M${day} 17v6`} stroke="currentColor" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {groups.map(([day, entries]) => <button key={day} data-day={day} type="button" aria-label={entries.map(entry => `${entry.label}: ${entry.detail} · ${relativeTimelineDate(entry.date, today)}`).join("; ")} aria-describedby={selection?.day === day ? tooltipId : undefined}
          className="absolute top-0 flex h-10 w-6 -translate-x-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          style={{ left: `${(day - firstDay) / dayCount * 100}%` }}
          onMouseEnter={event => showDetails(day, event.currentTarget)} onFocus={event => showDetails(day, event.currentTarget)} onClick={event => showDetails(day, event.currentTarget)} onBlur={() => setSelection(null)}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full border border-brand ${entries.some(entry => entry.label === "Now") ? "bg-brand" : "bg-surface"}`} />
        </button>)}
      </div>
    </div>
    {undated.length > 0 && <button type="button" aria-label="Milestones with no date" aria-describedby={selection?.day === null ? tooltipId : undefined}
      className="flex h-10 w-6 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      onMouseEnter={event => showDetails(null, event.currentTarget)} onFocus={event => showDetails(null, event.currentTarget)} onClick={event => showDetails(null, event.currentTarget)} onBlur={() => setSelection(null)}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full border border-dashed border-brand bg-surface" />
    </button>}
    </div>
    {selected && <div id={tooltipId} role="tooltip" style={{ left: `clamp(0px, ${selection!.offset}px, max(0px, calc(100% - 280px)))` }} className="absolute top-full z-20 w-[280px] max-w-full max-h-72 overflow-y-auto space-y-2 rounded border border-rule bg-surface px-3 py-2 text-[12px] text-ink shadow-sm">
      {selection?.day === null && <p className="font-semibold">No date</p>}
      {selected.map(entry => <div key={entry.label}><p className="font-semibold">{entry.label}</p><p>{entry.detail}</p>{"date" in entry && <p className="text-muted">{relativeTimelineDate(entry.date as string, today)} · Pacific Time</p>}</div>)}
    </div>}
  </div>;
}
