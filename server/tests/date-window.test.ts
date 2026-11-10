import { describe, expect, it } from "vitest";
import { resolveDateWindow } from "../src/research/date-window.js";

describe("resolveDateWindow", () => {
  const referenceTime = "2026-11-10T15:00:00.000Z";

  it("resolves an explicit date to the user's local calendar day", () => {
    const result = resolveDateWindow(
      "What did I ask you on 3 November?",
      referenceTime,
      "Asia/Kolkata"
    );
    expect(result).toBeDefined();
    expect(result?.from).toBe("2026-11-02T18:30:00.000Z");
    expect(result?.to).toBe("2026-11-03T18:30:00.000Z");
  });

  it("does not treat a verification-time reference as the historical conversation date", () => {
    const result = resolveDateWindow(
      "Does your previous answer on Postgres hosting still hold today?",
      referenceTime,
      "Asia/Kolkata"
    );
    expect(result).toBeUndefined();
  });

  it("still resolves today when the user asks what they discussed today", () => {
    const result = resolveDateWindow(
      "What did I ask you today?",
      referenceTime,
      "Asia/Kolkata"
    );
    expect(result).toBeDefined();
    expect(result?.from).toBe("2026-11-09T18:30:00.000Z");
    expect(result?.to).toBe("2026-11-10T18:30:00.000Z");
  });

  it("resolves last Tuesday to the previous Tuesday", () => {
    const result = resolveDateWindow(
      "Last Tuesday I asked about Postgres hosting.",
      referenceTime,
      "Asia/Kolkata"
    );
    expect(result?.from).toBe("2026-11-02T18:30:00.000Z");
    expect(result?.to).toBe("2026-11-03T18:30:00.000Z");
  });

  it("resolves a weekday reference to the most recent past weekday", () => {
    const result = resolveDateWindow(
      "On Monday we shortlisted five CRM tools.",
      referenceTime,
      "Asia/Kolkata"
    );
    expect(result?.from).toBe("2026-11-08T18:30:00.000Z");
    expect(result?.to).toBe("2026-11-09T18:30:00.000Z");
  });

  it("returns undefined when no date is present", () => {
    expect(resolveDateWindow(
      "Tell me about PostgreSQL hosting",
      referenceTime,
      "Asia/Kolkata"
    )).toBeUndefined();
  });
});
