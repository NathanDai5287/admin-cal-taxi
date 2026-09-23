export const DEFAULT_POLICY_TIME_ZONE = "America/Los_Angeles";

export type PolicyClock = {
  local_date: string;
  local_time: string;
  weekday: string;
  time_zone: string;
  utc_offset: string;
};

export type PolicyToolContext = {
  current_date_time: PolicyClock;
  calendar_math: {
    question_date: string;
    question_weekday: string;
    days_from_today: number;
    relative_to_today: string;
    weekdays_between_today_and_question_date: number;
    weekday_count_note: string;
  };
};

export type ClockQuestionIntent = "date" | "time" | "date_time";

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
}

function partsByType(date: Date, timeZone: string) {
  return Object.fromEntries(formatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
}

export function policyTimeZone() {
  const timeZone = process.env.POLICY_TIME_ZONE?.trim() || DEFAULT_POLICY_TIME_ZONE;
  // Intl performs the authoritative IANA time-zone validation for the Node runtime.
  formatter(timeZone);
  return timeZone;
}

export function getPolicyClock(now = new Date(), timeZone = policyTimeZone()): PolicyClock {
  if (!Number.isFinite(now.getTime())) throw new Error("A valid current time is required.");
  const parts = partsByType(now, timeZone);
  const zoneName = parts.timeZoneName || "GMT";
  return {
    local_date: `${parts.year}-${parts.month}-${parts.day}`,
    local_time: `${parts.hour}:${parts.minute}:${parts.second}`,
    weekday: parts.weekday,
    time_zone: timeZone,
    utc_offset: zoneName === "GMT" ? "+00:00" : zoneName.replace(/^GMT/, ""),
  };
}

function calendarDay(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Expected a calendar date in YYYY-MM-DD format.");
  const milliseconds = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(milliseconds);
  if (parsed.toISOString().slice(0, 10) !== date) throw new Error("Expected a valid calendar date.");
  return milliseconds / 86_400_000;
}

function weekday(date: string) {
  calendarDay(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T12:00:00Z`));
}

function weekdaysBetweenExclusive(firstDate: string, secondDate: string) {
  const start = Math.min(calendarDay(firstDate), calendarDay(secondDate)) + 1;
  const end = Math.max(calendarDay(firstDate), calendarDay(secondDate));
  const length = Math.max(0, end - start);
  const fullWeeks = Math.floor(length / 7);
  let count = fullWeeks * 5;
  for (let day = 0; day < length % 7; day++) {
    const weekdayNumber = new Date((start + fullWeeks * 7 + day) * 86_400_000).getUTCDay();
    if (weekdayNumber !== 0 && weekdayNumber !== 6) count++;
  }
  return count;
}

export function buildPolicyToolContext(questionDate: string, clock: PolicyClock): PolicyToolContext {
  const daysFromToday = calendarDay(questionDate) - calendarDay(clock.local_date);
  const relativeToToday = daysFromToday === 0
    ? "today"
    : daysFromToday > 0
      ? `${daysFromToday} calendar day${daysFromToday === 1 ? "" : "s"} from today`
      : `${Math.abs(daysFromToday)} calendar day${daysFromToday === -1 ? "" : "s"} before today`;
  return {
    current_date_time: clock,
    calendar_math: {
      question_date: questionDate,
      question_weekday: weekday(questionDate),
      days_from_today: daysFromToday,
      relative_to_today: relativeToToday,
      weekdays_between_today_and_question_date: weekdaysBetweenExclusive(clock.local_date, questionDate),
      weekday_count_note: "Monday-Friday dates strictly between today and the question date; holidays and agency-specific deadlines are not accounted for.",
    },
  };
}

export function clockQuestionIntent(question: string): ClockQuestionIntent | null {
  const normalized = question.toLowerCase().replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:what(?: is|'s) )?(?:the )?(?:current )?(?:date and time|time and date)(?: right now)?$/.test(normalized)) return "date_time";
  if (/^(?:what(?: is|'s) )?(?:the )?(?:current |today'?s )?date(?: today| right now)?$/.test(normalized) || /^(?:what day is it(?: right now)?|what(?: is|'s) today|today'?s date)$/.test(normalized)) return "date";
  if (/^(?:what(?: is|'s) )?(?:the )?(?:current )?time(?: right now)?$/.test(normalized)) return "time";
  return null;
}

function displayDate(date: string) {
  calendarDay(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "long" }).format(new Date(`${date}T12:00:00Z`));
}

export function describeClock(intent: ClockQuestionIntent, clock: PolicyClock) {
  const date = `${clock.weekday}, ${displayDate(clock.local_date)}`;
  if (intent === "date") return `Today is ${date} in ${clock.time_zone}.`;
  if (intent === "time") return `The current time is ${clock.local_time} (${clock.utc_offset}) in ${clock.time_zone}.`;
  return `It is ${clock.local_time} (${clock.utc_offset}) on ${date} in ${clock.time_zone}.`;
}
