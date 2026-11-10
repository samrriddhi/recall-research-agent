import { describe, expect, it } from "vitest";
import { formatMemoryContext } from "../src/agent/prompts.js";

describe("historical source evidence in memory context", () => {
  it("includes stored page snapshots and their timestamps for follow-up verification", () => {
    const context = formatMemoryContext([{
      role: "assistant",
      createdAt: "2026-11-03T10:00:00.000Z",
      content: "We compared Neon and Supabase.",
      sources: [{
        title: "Neon pricing",
        url: "https://neon.com/pricing",
        snippet: "Plans and billing.",
        content: "The Pro plan price changed on November 2, 2026.",
        publishedAt: "2026-11-01T00:00:00.000Z",
        modifiedAt: "2026-11-02T00:00:00.000Z",
        fetchStatus: "fetched",
        provider: "DuckDuckGo HTML",
        searchQuery: "Neon pricing"
      }]
    }]);

    expect(context).toContain("The Pro plan price changed on November 2, 2026.");
    expect(context).toContain("Published metadata: 2026-11-01T00:00:00.000Z");
    expect(context).toContain("Original search query: Neon pricing");
    expect(context).toContain("Evidence type: fetched");
  });

  it("keeps retrieved memory inside a predictable context budget", () => {
    const context = formatMemoryContext(Array.from({ length: 30 }, (_, index) => ({
      role: "user",
      createdAt: "2026-11-03T10:00:00.000Z",
      content: "Historical conversation " + index + " " + "details ".repeat(200),
      sources: [{
        title: "Source " + index,
        url: "https://example.com/" + index,
        content: "Snapshot ".repeat(500),
        snippet: "Snippet ".repeat(100)
      }]
    })));

    expect(context.length).toBeLessThanOrEqual(8_000);
  });
});
