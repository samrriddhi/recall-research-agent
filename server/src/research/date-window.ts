import * as chrono from "chrono-node";

export interface DateWindow {
  from: string;
  to: string;
  matchedText: string;
}

function localMidnightAsUtc(year: number, month: number, day: number, timeZone: string): Date {
  const referenceNoonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(referenceNoonUtc);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localClockAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  const offset = localClockAsUtc - referenceNoonUtc.getTime();
  return new Date(Date.UTC(year, month - 1, day) - offset);
}

/**
 * Resolve date references using the browser's instant and timezone. The
 * returned range is converted to UTC so it can filter ISO timestamps in SQLite.
 */
export function resolveDateWindow(
  query: string,
  referenceTime: string | undefined,
  timeZone = "UTC"
): DateWindow | undefined {
  const reference = referenceTime ? new Date(referenceTime) : new Date();
  if (Number.isNaN(reference.getTime())) return undefined;

  let matches: ReturnType<typeof chrono.parse>;
  try {
    matches = chrono.parse(query, { instant: reference, timezone: timeZone }, { forwardDate: false });
  } catch {
    matches = chrono.parse(query, reference, { forwardDate: false });
  }

  const match = matches.find((item) => item.start.isCertain("day"));
  if (!match) return undefined;

  const parsedDate = match.start.date();
  const year = match.start.get("year") ?? parsedDate.getUTCFullYear();
  const month = match.start.get("month") ?? parsedDate.getUTCMonth() + 1;
  const day = match.start.get("day") ?? parsedDate.getUTCDate();

  let start: Date;
  try {
    start = localMidnightAsUtc(year, month, day, timeZone);
  } catch {
    start = new Date(Date.UTC(year, month - 1, day));
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    matchedText: match.text
  };
}
