import { describe, expect, it } from "vitest";
import { parseDuckDuckGoResults } from "../src/research/web-search.js";

describe("parseDuckDuckGoResults", () => {
  it("extracts standard HTML results", () => {
    const html = '<div class="result"><a class="result__a" href="https://example.com/pricing">Example pricing</a><a class="result__snippet">Plans and pricing details.</a></div>';
    const results = parseDuckDuckGoResults(html, "https://html.duckduckgo.com/html/", "DuckDuckGo HTML");

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/pricing");
    expect(results[0]?.title).toBe("Example pricing");
  });

  it("unwraps DuckDuckGo redirect URLs", () => {
    const target = encodeURIComponent("https://example.com/docs");
    const html = '<div class="result"><a class="result__a" href="/l/?uddg=' + target + '">Example docs</a></div>';
    const results = parseDuckDuckGoResults(html, "https://html.duckduckgo.com/html/", "DuckDuckGo HTML");
    expect(results[0]?.url).toBe("https://example.com/docs");
  });

  it("drops non-HTTP and search-provider links", () => {
    const html = '<div class="result"><a class="result__a" href="javascript:alert(1)">Unsafe</a></div>' +
      '<div class="result"><a class="result__a" href="https://duckduckgo.com/about">Internal</a></div>' +
      '<div class="result"><a class="result__a" href="https://example.com/valid">Valid result</a></div>';
    const results = parseDuckDuckGoResults(html, "https://html.duckduckgo.com/html/", "DuckDuckGo HTML");
    expect(results.map((result) => result.url)).toEqual(["https://example.com/valid"]);
  });
});
