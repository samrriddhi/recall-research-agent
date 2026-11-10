import * as chrono from "chrono-node";

export interface DateWindow {
  from: string;
  to: string;
  matchedText: string;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const WEEKDAYS = new Map<string, number>([
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6]
]);

function localCalendarDate(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function localMidnightAsUtc(year: number, month: number, day: number, timeZone: string): Date {
  const localWallTime = Date.UTC(year, month - 1, day);
  let candidate = localWallTime;

  // Calculate the IANA timezone offset at the target date. Iteration handles
  // offsets that cross UTC date boundaries and daylight-saving transitions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    const offset = representedAsUtc - candidate;
    candidate = localWallTime - offset;
  }

  return new Date(candidate);
}

function buildWindow(date: CalendarDate, matchedText: string, timeZone: string): DateWindow {
  const start = localMidnightAsUtc(date.year, date.month, date.day, timeZone);
  const nextCalendarDate = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const end = localMidnightAsUtc(
    nextCalendarDate.getUTCFullYear(),
    nextCalendarDate.getUTCMonth() + 1,
    nextCalendarDate.getUTCDate(),
    timeZone
  );
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    matchedText
  };
}

function resolveWeekday(
  query: string,
  reference: Date,
  timeZone: string
): DateWindow | undefined {
  const weekdayPattern = /\b(?:(last|previous)\s+)?(on\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  // An explicit calendar date is more precise than a weekday mentioned
  // alongside it ("Monday, 3 November 2025").
  if (/\\b\\d{1,2}\\s+[a-z]+\\b|\\b[a-z]+\\s+\\d{1,2}(?:,?\\s+\\d{4})?\\b/i.test(query)) {
    return undefined;
  }

  const match = weekdayPattern.exec(query);
  if (!match) return undefined;

  const modifier = (match[1] ?? "").toLowerCase();
  const qualifier = (match[2] ?? "").trim().toLowerCase();
  const dayName = match[3]?.toLowerCase();
  if (!dayName) return undefined;

  const targetDay = WEEKDAYS.get(dayName);
  if (targetDay === undefined) return undefined;

  const localToday = localCalendarDate(reference, timeZone);
  const todayUtc = new Date(Date.UTC(localToday.year, localToday.month - 1, localToday.day));
  const currentDay = todayUtc.getUTCDay();
  let resolved: Date;
  if (qualifier === "this" && modifier === "") {
    const daysForward = (targetDay - currentDay + 7) % 7;
    resolved = new Date(Date.UTC(
      localToday.year,
      localToday.month - 1,
      localToday.day + daysForward
    ));
  } else {
    let daysBack = (currentDay - targetDay + 7) % 7;
    // "Last Tuesday" means the prior week's Tuesday when today is Tuesday.
    if ((modifier === "last" || modifier === "previous") && daysBack === 0) {
      daysBack = 7;
    }
    resolved = new Date(Date.UTC(
      localToday.year,
      localToday.month - 1,
      localToday.day - daysBack
    ));
  }
  return buildWindow({
    year: resolved.getUTCFullYear(),
    month: resolved.getUTCMonth() + 1,
    day: resolved.getUTCDate()
  }, match[0], timeZone);
}

/**
 * Resolve date references using the browser's reference instant and timezone.
 * The output range is UTC, matching ISO timestamps stored in SQLite.
 */
export function resolveDateWindow(
  query: string,
  referenceTime: string | undefined,
  timeZone = "UTC"
): DateWindow | undefined {
  const reference = referenceTime ? new Date(referenceTime) : new Date();
  if (Number.isNaN(reference.getTime())) return undefined;

  const weekdayWindow = resolveWeekday(query, reference, timeZone);
  if (weekdayWindow) return weekdayWindow;

  const isHistoricalRecall = /\bwhat did (i|we) (ask|discuss|talk about)\b/i.test(query)
    || /\b(conversation|discussion|chat|messages?) (from|on|during) today\b/i.test(query);

  if (isHistoricalRecall && /\btoday\b/i.test(query)) {
    return buildWindow(localCalendarDate(reference, timeZone), "today", timeZone);
  }

  let matches: ReturnType<typeof chrono.parse>;
  try {
    matches = chrono.parse(
      query,
      { instant: reference, timezone: timeZone },
      { forwardDate: false }
    );
  } catch {
    matches = chrono.parse(query, reference, { forwardDate: false });
  }

  const match = matches.find((item) => {
    // "Today" normally anchors verification time, not the historic discussion.
    if (item.text.toLowerCase() === "today") return false;
    return item.start.isCertain("day");
  });
  if (!match) return undefined;

  const parsedDate = match.start.date();
  const date = {
    year: match.start.get("year") ?? parsedDate.getUTCFullYear(),
    month: match.start.get("month") ?? parsedDate.getUTCMonth() + 1,
    day: match.start.get("day") ?? parsedDate.getUTCDate()
  };

  try {
    return buildWindow(date, match.text, timeZone);
  } catch {
    return buildWindow(date, match.text, "UTC");
  }
}
