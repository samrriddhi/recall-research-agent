import { describe, expect, it } from "vitest";
import { renderSearchContext } from "../src/agent/agent.service.js";

describe("numbered search evidence", () => {
  it("keeps all displayed sources in one stable numbered evidence list", () => {
    const sources = Array.from({ length: 12 }, (_, index) => ({
      title: "Provider " + (index + 1),
      url: "https://example.com/provider-" + (index + 1),
      snippet: "Pricing and release details for provider " + (index + 1) + ".",
      source: "DuckDuckGo HTML" as const,
      fetchStatus: "snippet-only" as const
    }));

    const context = renderSearchContext(sources);
    expect(context).toContain("[1] Provider 1");
    expect(context).toContain("[8] Provider 8");
    expect(context).toContain("[12] Provider 12");
    expect(context).not.toContain("[13]");
  });
});
