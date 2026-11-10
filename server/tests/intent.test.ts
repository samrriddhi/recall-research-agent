import { describe, expect, it } from "vitest";
import { classifyIntent } from "../src/agent/intent.js";

describe("classifyIntent", () => {
  it("recognizes a historical recall question", () => {
    const result = classifyIntent("What did I ask you on 3 November?");
    expect(result.historicalRecall).toBe(true);
  });

  it("recognizes a current comparison request", () => {
    const result = classifyIntent("Has Neon changed pricing since then?");
    expect(result.comparison).toBe(true);
    expect(result.shouldSearch).toBe(true);
  });

  it("recognizes plural price changes as current research", () => {
    const result = classifyIntent("Have any of those tools changed their prices?");
    expect(result.comparison).toBe(true);
    expect(result.shouldSearch).toBe(true);
  });

  it("does not search for a conversational message", () => {
    const result = classifyIntent("Thanks, that helped.");
    expect(result.shouldSearch).toBe(false);
  });
});
