import { load } from "cheerio";
import { env } from "../config/env.js";
import { fetchPageEvidence } from "./page-fetcher.js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "DuckDuckGo HTML" | "DuckDuckGo Lite";
  content?: string;
  publishedAt?: string;
  modifiedAt?: string;
  fetchStatus?: "fetched" | "snippet-only";
}

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9"
};

function normalizeResultUrl(rawUrl: string, baseUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    const redirected = parsed.searchParams.get("uddg");
    const candidate = redirected ? new URL(redirected) : parsed;

    if (!["http:", "https:"].includes(candidate.protocol)) return undefined;
    if (candidate.hostname.endsWith("duckduckgo.com")) return undefined;
    return candidate.toString();
  } catch {
    return undefined;
  }
}

export function parseDuckDuckGoResults(
  html: string,
  baseUrl: string,
  source: WebSearchResult["source"]
): WebSearchResult[] {
  const $ = load(html);
  const results: WebSearchResult[] = [];

  const containers = $(".result");
  if (containers.length > 0) {
    containers.each((_, element) => {
      const item = $(element);
      const anchor = item.find("a.result__a, a.result-link").first();
      const title = anchor.text().trim();
      const href = anchor.attr("href");
      const snippet = item.find(".result__snippet, .result-snippet").first().text().trim();
      if (!title || !href) return;

      const url = normalizeResultUrl(href, baseUrl);
      if (url) results.push({ title, url, snippet, source, fetchStatus: "snippet-only" });
    });
  } else {
    $("a.result-link").each((_, element) => {
      const anchor = $(element);
      const title = anchor.text().trim();
      const href = anchor.attr("href");
      const snippet = anchor.closest("tr").next("tr").find(".result-snippet").text().trim();
      if (!title || !href) return;

      const url = normalizeResultUrl(href, baseUrl);
      if (url) results.push({ title, url, snippet, source, fetchStatus: "snippet-only" });
    });
  }

  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
}

async function requestHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(env.WEB_SEARCH_TIMEOUT_MS),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error("Search provider returned HTTP " + response.status + ".");
  }

  const html = await response.text();
  if (!html || html.length < 200) {
    throw new Error("Search provider returned an empty response.");
  }
  return html;
}

async function enrichResults(
  results: WebSearchResult[],
  pageCount: number
): Promise<WebSearchResult[]> {
  return Promise.all(results.map(async (result, index) => {
    if (index >= pageCount) return result;
    try {
      const evidence = await fetchPageEvidence(result.url);
      return {
        ...result,
        title: evidence.title || result.title,
        content: evidence.content || undefined,
        publishedAt: evidence.publishedAt,
        modifiedAt: evidence.modifiedAt,
        fetchStatus: evidence.content ? "fetched" as const : "snippet-only" as const
      };
    } catch {
      // Search snippets still provide a fallback when a site blocks page reading.
      return { ...result, fetchStatus: "snippet-only" as const };
    }
  }));
}

/**
 * Keyless web search. DuckDuckGo's HTML and Lite frontends are used in order.
 * The first few result pages are read with bounded requests so the agent can
 * inspect primary-page text rather than relying only on search snippets.
 */
export async function searchWeb(
  query: string,
  maxResults = env.WEB_SEARCH_MAX_RESULTS,
  hydrateCount = 2
): Promise<WebSearchResult[]> {
  const normalizedQuery = query.trim().slice(0, 300);
  if (normalizedQuery.length < 2) {
    throw new Error("Enter a search query with at least two characters.");
  }

  const attempts: Array<{ url: string; source: WebSearchResult["source"] }> = [
    {
      url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(normalizedQuery) + "&kl=in-en",
      source: "DuckDuckGo HTML"
    },
    {
      url: "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(normalizedQuery),
      source: "DuckDuckGo Lite"
    }
  ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const html = await requestHtml(attempt.url);
      const parsed = parseDuckDuckGoResults(html, attempt.url, attempt.source);
      if (parsed.length > 0) {
        const boundedResults = parsed.slice(0, Math.min(maxResults, 10));
        return enrichResults(boundedResults, Math.min(hydrateCount, boundedResults.length));
      }
      failures.push(attempt.source + ": no parseable results");
    } catch (error) {
      failures.push(
        attempt.source + ": " + (error instanceof Error ? error.message : "request failed")
      );
    }
  }

  throw new Error("Free web search is temporarily unavailable. " + failures.join(" | "));
}
