import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import { env } from "../config/env.js";

export interface PageEvidence {
  title?: string;
  content: string;
  publishedAt?: string;
  modifiedAt?: string;
}

const MAX_HTML_BYTES = 350_000;
const MAX_CONTENT_CHARS = 2_500;
const MAX_REDIRECTS = 3;
const PAGE_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml;q=0.9",
  "accept-language": "en-IN,en;q=0.9"
};

function unsafeIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function unsafeIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? address;
  const version = isIP(normalized);
  if (version === 4) return unsafeIpv4(normalized);
  if (version !== 6) return true;
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4?.[1]) return unsafeIpv4(mappedV4[1]);
  return normalized === "::" || normalized === "::1"
    || normalized.startsWith("::ffff:")
    || normalized.startsWith("fc") || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")
    || normalized.startsWith("2002:");
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function isAllowedPublicPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port && !["80", "443"].includes(url.port)) return false;
    const hostname = normalizedHostname(url);
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")
      || hostname.endsWith(".local") || hostname.endsWith(".internal")
      || hostname.endsWith(".test")) return false;
    if (isIP(hostname) && unsafeIp(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function assertPublicDestination(url: URL): Promise<void> {
  if (!isAllowedPublicPageUrl(url.toString())) {
    throw new Error("The result URL is not an allowed public web address.");
  }
  const hostname = normalizedHostname(url);
  if (isIP(hostname)) return;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => unsafeIp(item.address))) {
    throw new Error("The result host did not resolve exclusively to public IP addresses.");
  }
}

async function readLimitedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_HTML_BYTES) {
    await response.body?.cancel();
    throw new Error("The source page is larger than the extraction limit.");
  }
  if (!response.body) throw new Error("The source page returned an empty body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let html = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("The source page exceeded the extraction limit.");
    }
    html += decoder.decode(chunk.value, { stream: true });
  }
  return html + decoder.decode();
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function jsonLdDates(value: unknown, depth = 0): { publishedAt?: string; modifiedAt?: string } {
  if (depth > 8 || value === null || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = jsonLdDates(item, depth + 1);
      if (found.publishedAt || found.modifiedAt) return found;
    }
    return {};
  }
  const record = value as Record<string, unknown>;
  const publishedAt = typeof record.datePublished === "string" ? normalizeDate(record.datePublished) : undefined;
  const modifiedAt = typeof record.dateModified === "string" ? normalizeDate(record.dateModified) : undefined;
  if (publishedAt || modifiedAt) return { publishedAt, modifiedAt };
  for (const child of Object.values(record)) {
    const found = jsonLdDates(child, depth + 1);
    if (found.publishedAt || found.modifiedAt) return found;
  }
  return {};
}

export function parsePageEvidenceHtml(html: string): PageEvidence {
  const $ = load(html);
  const title = (
    $('meta[property="og:title"]').attr("content")
    || $("title").first().text()
    || $("h1").first().text()
  ).trim();

  let publishedAt = normalizeDate(
    $('meta[property="article:published_time"]').attr("content")
    || $('meta[name="datePublished"]').attr("content")
    || $('meta[name="date"]').attr("content")
    || $('time[pubdate]').attr("datetime")
  );
  let modifiedAt = normalizeDate(
    $('meta[property="article:modified_time"]').attr("content")
    || $('meta[property="og:updated_time"]').attr("content")
    || $('meta[name="last-modified"]').attr("content")
  );

  $('script[type="application/ld+json"]').each((_, element) => {
    if (publishedAt && modifiedAt) return;
    try {
      const dates = jsonLdDates(JSON.parse($(element).text()) as unknown);
      publishedAt ??= dates.publishedAt;
      modifiedAt ??= dates.modifiedAt;
    } catch {
      // Ignore malformed structured metadata.
    }
  });

  $("script, style, svg, nav, footer, aside, form, noscript, iframe, header, button").remove();
  const article = $("article").first();
  const main = $('main, [role="main"]').first();
  const root = article.length ? article : main.length ? main : $("body");
  const blocks = root.find("h1, h2, h3, p, li, td, th")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((text) => text.length >= 25);
  const content = [...new Set(blocks)].join("\n").slice(0, MAX_CONTENT_CHARS)
    || root.text().replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS);

  return { title: title || undefined, content, publishedAt, modifiedAt };
}

export async function fetchPageEvidence(initialUrl: string): Promise<PageEvidence> {
  let current = new URL(initialUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicDestination(current);
    const response = await fetch(current, {
      headers: PAGE_HEADERS,
      signal: AbortSignal.timeout(Math.min(env.WEB_SEARCH_TIMEOUT_MS, 9_000)),
      redirect: "manual"
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error("The source page redirected too many times.");
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw new Error("The source page returned HTTP " + response.status + ".");
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      throw new Error("The source URL did not return an HTML page.");
    }
    return parsePageEvidenceHtml(await readLimitedHtml(response));
  }
  throw new Error("The source page redirected too many times.");
}
