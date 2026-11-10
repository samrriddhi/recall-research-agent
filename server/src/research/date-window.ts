import * as chrono from "chrono-node";

export interface DateWindow {
  from: string;
  to: string;
  matchedText: string;
}

/**
 * Resolve explicit date references against the timestamp supplied by the
 * browser. Keeping the reference time explicit makes relative-date behavior
 * deterministic in tests and independent of the server's clock.
 */
export function resolveDateWindow(
  query: string,
  referenceTime: string | undefined
): DateWindow | undefined {
  const reference = referenceTime ? new Date(referenceTime) : new Date();
  if (Number.isNaN(reference.getTime())) return undefined;

  const matches = chrono.parse(query, reference, { forwardDate: false });
  const match = matches.find((item) => item.start.isCertain("day"));
  if (!match) return undefined;

  const resolved = match.start.date();
  const start = new Date(Date.UTC(
    resolved.getUTCFullYear(),
    resolved.getUTCMonth(),
    resolved.getUTCDate()
  ));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    matchedText: match.text
  };
}
