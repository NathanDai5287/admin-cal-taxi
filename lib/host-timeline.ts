const millisecondsPerDay = 86_400_000;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function timelineDay(value: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|\s)/.exec(value);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / millisecondsPerDay;
  const written = /^([A-Za-z]+) (\d{1,2}), (\d{4})(?:$|\s)/.exec(value);
  if (!written) return null;
  const month = monthNames.indexOf(written[1]);
  if (month < 0) return null;
  return Date.UTC(Number(written[3]), month, Number(written[2])) / millisecondsPerDay;
}

export function relativeTimelineDate(value: string, today: string): string {
  const day = timelineDay(value);
  const currentDay = timelineDay(today);
  if (day === null || currentDay === null) return "";
  const difference = day - currentDay;
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference === -1) return "Yesterday";
  return difference > 0 ? `In ${difference} days` : `${-difference} days ago`;
}

export type TimelineDate = { label: string; date: string; detail: string };

export function timelineDateGroups(dates: TimelineDate[]) {
  const groups = new Map<number, TimelineDate[]>();
  for (const date of dates) {
    const day = timelineDay(date.date);
    if (day === null) continue;
    groups.set(day, [...(groups.get(day) ?? []), date]);
  }
  return [...groups].sort(([first], [second]) => first - second);
}
