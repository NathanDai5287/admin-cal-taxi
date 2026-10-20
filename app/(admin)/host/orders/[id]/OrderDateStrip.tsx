"use client";

import { useEffect, useId, useRef, useState } from "react";
import { relativeTimelineDate, timelineDateGroups, timelineDay, type TimelineDate } from "@/lib/host-timeline";

const markerWidth = 64;
const laneHeight = 48;
const tooltipWidth = 280;

export default function OrderDateStrip({ dates, undated, today, endDate }: { dates: TimelineDate[]; undated: { label: string; detail: string }[]; today: string; endDate: string }) {
  const [selection, setSelection] = useState<{ day: number | null; left: number; top: number; space: number; above: boolean } | null>(null);
  const [width, setWidth] = useState(320);
  const strip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const groups = timelineDateGroups(dates);
  const firstDay = groups[0][0];
  const dayCount = Math.max(1, Math.max(groups.at(-1)![0], timelineDay(endDate)!) - firstDay);
  const selected = selection?.day === null ? undated : groups.find(([day]) => day === selection?.day)?.[1];
  const laneEnds: number[] = [];
  const markers = groups.map(([day, entries]) => {
    const left = markerWidth / 2 + (day - firstDay) / dayCount * Math.max(0, width - markerWidth);
    const availableLane = laneEnds.findIndex(end => left - end >= markerWidth);
    const lane = availableLane < 0 ? laneEnds.length : availableLane;
    laneEnds[lane] = left;
    return { day, entries, left, lane };
  });

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setSelection(null);
    });
    observer.observe(strip.current!);
    return () => observer.disconnect();
  }, []);

  function showDetails(day: number | null, button: HTMLButtonElement) {
    const bounds = (button.querySelector("[aria-hidden]") ?? button).getBoundingClientRect();
    const parent = strip.current!.getBoundingClientRect();
    const above = window.innerHeight - bounds.bottom < 220 && bounds.top > window.innerHeight - bounds.bottom;
    const space = above ? bounds.top - 16 : window.innerHeight - bounds.bottom - 16;
    setSelection({ day, left: bounds.left + bounds.width / 2 - parent.left, top: (above ? bounds.top : bounds.bottom) - parent.top, space, above });
  }

  return <div ref={strip} className="relative mb-3 min-w-0" onMouseLeave={() => setSelection(null)} onKeyDown={event => { if (event.key === "Escape") setSelection(null); }}>
    <p className="mb-2 text-[11px] text-muted">Key dates · Hover or select for details</p>
    <div aria-label="Key event dates" className="relative" style={{ height: laneEnds.length * laneHeight }}>
      {laneEnds.map((_, lane) => <span key={lane} aria-hidden="true" className="absolute right-8 left-8 border-t border-rule" style={{ top: lane * laneHeight + 8 }} />)}
      {markers.map(({ day, entries, left, lane }) => <button key={day} type="button" aria-label={entries.map(entry => `${entry.label}: ${entry.detail} · ${relativeTimelineDate(entry.date, today)}`).join("; ")} aria-describedby={selection?.day === day ? tooltipId : undefined}
        className="absolute h-11 w-16 -translate-x-1/2 text-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        style={{ left, top: lane * laneHeight }}
        onMouseEnter={event => showDetails(day, event.currentTarget)} onFocus={event => showDetails(day, event.currentTarget)} onClick={event => showDetails(day, event.currentTarget)} onBlur={() => setSelection(null)}>
        <span aria-hidden="true" className={`absolute top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-brand ${entries.some(entry => entry.label === "Now") ? "bg-brand" : "bg-surface"}`} />
        <span className="mt-3 block text-[12px] font-semibold text-ink">{new Date(day * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
        {entries.some(entry => entry.label === "Now") && <span className="sr-only">Today</span>}
      </button>)}
    </div>
    {undated.length > 0 && <button type="button" aria-label="Milestones with no date" aria-describedby={selection?.day === null ? tooltipId : undefined}
      className="min-h-11 px-2 text-[12px] text-muted underline decoration-dashed underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand"
      onMouseEnter={event => showDetails(null, event.currentTarget)} onFocus={event => showDetails(null, event.currentTarget)} onClick={event => showDetails(null, event.currentTarget)} onBlur={() => setSelection(null)}>
      No date · {undated.length} milestones
    </button>}
    {selected && <div id={tooltipId} role="tooltip" style={{ left: `clamp(0px, ${selection!.left - tooltipWidth / 2}px, max(0px, calc(100% - ${tooltipWidth}px)))`, top: selection!.top + (selection!.above ? -8 : 8), maxHeight: selection!.space, transform: selection!.above ? "translateY(-100%)" : undefined }} className="absolute z-20 w-[280px] max-w-full overflow-y-auto space-y-2 rounded border border-rule bg-surface px-3 py-2 text-[12px] text-ink shadow-sm">
      {selection?.day === null && <p className="font-semibold">No date</p>}
      {selected.map(entry => <div key={entry.label}><p className="font-semibold">{entry.label}</p><p>{entry.detail}</p>{"date" in entry && <p className="text-muted">{relativeTimelineDate(entry.date as string, today)} · Pacific Time</p>}</div>)}
    </div>}
  </div>;
}
