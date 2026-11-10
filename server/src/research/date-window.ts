import * as chrono from "chrono-node";

export interface DateWindow {
  from: string;
  to: string;
  matchedText: string;
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
