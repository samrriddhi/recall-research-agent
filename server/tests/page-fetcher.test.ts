import { describe, expect, it } from "vitest";
import { isAllowedPublicPageUrl, parsePageEvidenceHtml } from "../src/research/page-fetcher.js";

describe("page evidence extraction", () => {
  it("extracts readable article text and publication metadata", () => {
    const html = `
      <html><head>
        <title>Provider pricing</title>
        <meta property="article:published_time" content="2026-11-05T12:00:00Z" />
        <meta property="article:modified_time" content="2026-11-09T12:00:00Z" />
        <script>alert("this must not be extracted")</script>
      </head><body>
        <nav>Navigation text should not appear in evidence.</nav>
        <main>
          <h1>Pricing plans</h1>
          <p>The provider changed its standard plan price on November 7, 2026.</p>
          <p>Annual billing is offered separately from monthly billing.</p>
        </main>
        <footer>Footer text should not appear.</footer>
      </body></html>`;

    const evidence = parsePageEvidenceHtml(html);
    expect(evidence.title).toBe("Provider pricing");
    expect(evidence.content).toContain("changed its standard plan price");
    expect(evidence.content).not.toContain("Navigation text");
    expect(evidence.content).not.toContain("alert(");
    expect(evidence.publishedAt).toBe("2026-11-05T12:00:00.000Z");
    expect(evidence.modifiedAt).toBe("2026-11-09T12:00:00.000Z");
  });

  it("reads publication metadata from JSON-LD", () => {
    const html = `<html><head><title>Release notes</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","datePublished":"2026-11-01","dateModified":"2026-11-08"}
      </script></head><body><article>
      <p>This release adds important database features and changes availability.</p>
      </article></body></html>`;
    const evidence = parsePageEvidenceHtml(html);
    expect(evidence.publishedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(evidence.modifiedAt).toBe("2026-11-08T00:00:00.000Z");
  });

  it("allows public HTTP(S) destinations and rejects unsafe URL forms", () => {
    expect(isAllowedPublicPageUrl("https://example.com/pricing")).toBe(true);
    expect(isAllowedPublicPageUrl("http://example.com/changelog")).toBe(true);
    expect(isAllowedPublicPageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedPublicPageUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedPublicPageUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isAllowedPublicPageUrl("http://192.168.1.2/")).toBe(false);
    expect(isAllowedPublicPageUrl("http://localhost:8787/")).toBe(false);
    expect(isAllowedPublicPageUrl("http://service.internal/")).toBe(false);
    expect(isAllowedPublicPageUrl("https://user:pass@example.com/")).toBe(false);
  });
});
