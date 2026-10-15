"use client";

import { useId, useState } from "react";
import { relativeTimelineDate, timelineDateGroups, timelineDay, type TimelineDate } from "@/lib/host-timeline";

export default function OrderDateStrip({ dates, today, endDate }: { dates: TimelineDate[]; today: string; endDate: string }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const tooltipId = useId();
  const groups = timelineDateGroups(dates);
  const firstDay = groups[0][0];
  const dayCount = Math.max(1, Math.max(groups.at(-1)![0], timelineDay(endDate)!) - firstDay);
  const selected = groups.find(([day]) => day === selectedDay)?.[1];

  return <div className="relative mb-3" onMouseLeave={() => setSelectedDay(null)} onKeyDown={event => { if (event.key === "Escape") setSelectedDay(null); }}>
    <div aria-label="Event dates; each tick is one day" className="overflow-x-auto px-3">
      <div className="relative h-10" style={{ minWidth: dayCount * 24 }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-10 w-full text-rule" viewBox={`0 0 ${dayCount} 40`} preserveAspectRatio="none">
          <path d={`M0 20H${dayCount}`} stroke="currentColor" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: dayCount + 1 }, (_, day) => <path key={day} d={`M${day} 17v6`} stroke="currentColor" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {groups.map(([day, entries]) => <button key={day} type="button" aria-label={entries.map(entry => `${entry.label}: ${entry.detail} · ${relativeTimelineDate(entry.date, today)}`).join("; ")} aria-describedby={selectedDay === day ? tooltipId : undefined}
          className="absolute top-0 flex h-10 w-6 -translate-x-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          style={{ left: `${(day - firstDay) / dayCount * 100}%` }}
          onMouseEnter={() => setSelectedDay(day)} onFocus={() => setSelectedDay(day)} onClick={() => setSelectedDay(day)} onBlur={() => setSelectedDay(null)}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full border border-brand ${entries.some(entry => entry.label === "Now") ? "bg-brand" : "bg-surface"}`} />
        </button>)}
      </div>
    </div>
    {selected && <div id={tooltipId} role="tooltip" className="absolute right-0 top-full z-20 w-max max-w-full space-y-2 rounded border border-rule bg-surface px-3 py-2 text-[12px] text-ink shadow-sm">
      {selected.map(entry => <div key={entry.label}><p className="font-semibold">{entry.label}</p><p>{entry.detail}</p><p className="text-muted">{relativeTimelineDate(entry.date, today)} · Pacific Time</p></div>)}
    </div>}
  </div>;
}
