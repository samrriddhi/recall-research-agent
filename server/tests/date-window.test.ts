import { describe, expect, it } from "vitest";
import { resolveDateWindow } from "../src/research/date-window.js";

describe("resolveDateWindow", () => {
  const referenceTime = "2026-11-10T15:00:00.000Z";

  it("resolves an explicit calendar date", () => {
    const result = resolveDateWindow("What did I ask you on 3 November?", referenceTime);
    expect(result).toBeDefined();
    expect(result?.from).toBe("2026-11-03T00:00:00.000Z");
    expect(result?.to).toBe("2026-11-04T00:00:00.000Z");
  });

  it("returns undefined when no date is present", () => {
    expect(resolveDateWindow("Tell me about PostgreSQL hosting", referenceTime)).toBeUndefined();
  });
});
