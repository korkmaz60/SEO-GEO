import { createHash } from "node:crypto";

import { load, type CheerioAPI } from "cheerio";

import { normalizeUrl } from "./url.js";

export interface PageLink {
  /** Normalized absolute URL. */
  url: string;
  anchor: string;
  nofollow: boolean;
}

/** What the audit rules need from an HTML page. */
export interface PageFacts {
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  /** Directives from `<meta name="robots">` and `<meta name="googlebot">`, lower case. */
  robotsDirectives: string[];
  /** Normalized absolute canonical URL. */
  canonical: string | null;
  canonicalCount: number;
  h1: string[];
  lang: string | null;
  hreflang: { lang: string; href: string }[];
  links: PageLink[];
  images: number;
  imagesMissingAlt: number;
  /** `@type` values of JSON-LD blocks, including `@graph` entries. */
  schemaTypes: string[];
  invalidJsonLd: number;
  wordCount: number;
  /** Hash of the visible text, for duplicate detection; `null` for pages without text. */
  contentHash: string | null;
  hasViewport: boolean;
  hasOpenGraph: boolean;
}

const MAX_ANCHOR_LENGTH = 200;
const MAX_SCHEMA_DEPTH = 6;

const squash = (text: string) => text.replace(/\s+/gu, " ").trim();

function attribute($: CheerioAPI, selector: string, name: string): string[] {
  return $(selector)
    .map((_, element) => $(element).attr(name) ?? "")
    .get()
    .map((value: string) => squash(value));
}

function collectTypes(value: unknown, types: Set<string>, depth = 0): void {
  if (depth > MAX_SCHEMA_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectTypes(entry, types, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  for (const name of Array.isArray(type) ? type : [type]) {
    if (typeof name === "string" && name.trim()) types.add(name.trim());
  }
  for (const [key, child] of Object.entries(record)) {
    if (key !== "@type" && child !== null && typeof child === "object") {
      collectTypes(child, types, depth + 1);
    }
  }
}

/** Parses an HTML document (spec-compliant parser, like a browser) into {@link PageFacts}. */
export function extractPageFacts(html: string, pageUrl: string): PageFacts {
  const $ = load(html);
  const baseHref = $("base[href]").first().attr("href");
  const base = (baseHref && normalizeUrl(baseHref, pageUrl)) || pageUrl;

  // Titles inside inline SVG images are not page titles.
  const titles = $("title")
    .filter((_, element) => $(element).closest("svg").length === 0)
    .map((_, element) => squash($(element).text()))
    .get();
  const descriptions = attribute($, 'meta[name="description" i]', "content");
  const robotsDirectives = attribute(
    $,
    'meta[name="robots" i], meta[name="googlebot" i]',
    "content",
  )
    .flatMap((content) => content.toLowerCase().split(","))
    .map((directive) => directive.trim())
    .filter(Boolean);
  const canonicals = attribute($, 'link[rel~="canonical" i]', "href");

  const links: PageLink[] = [];
  $("a[href]").each((_, element) => {
    const anchorElement = $(element);
    const url = normalizeUrl(anchorElement.attr("href") ?? "", base);
    if (!url) return;
    const rel = (anchorElement.attr("rel") ?? "").toLowerCase().split(/\s+/u);
    const anchor =
      squash(anchorElement.text()) ||
      squash(anchorElement.find("img[alt]").first().attr("alt") ?? "");
    links.push({
      url,
      anchor: anchor.slice(0, MAX_ANCHOR_LENGTH),
      nofollow: rel.includes("nofollow"),
    });
  });

  const images = $("img");
  const imagesMissingAlt = images.filter((_, element) => $(element).attr("alt") === undefined);

  const types = new Set<string>();
  let invalidJsonLd = 0;
  $('script[type="application/ld+json" i]').each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      collectTypes(JSON.parse(text), types);
    } catch {
      invalidJsonLd++;
    }
  });

  const hreflang = $('link[rel~="alternate" i][hreflang]')
    .map((_, element) => {
      const href = normalizeUrl($(element).attr("href") ?? "", base);
      const lang = squash($(element).attr("hreflang") ?? "").toLowerCase();
      return href && lang ? { lang, href } : null;
    })
    .get()
    .filter((entry): entry is { lang: string; href: string } => entry !== null);

  $("script, style, noscript, template, svg, iframe").remove();
  const text = squash($("body").text());
  const words = text ? text.split(" ").length : 0;

  return {
    title: titles[0] ?? null,
    titleCount: titles.length,
    metaDescription: descriptions[0] ?? null,
    metaDescriptionCount: descriptions.length,
    robotsDirectives,
    canonical: canonicals[0] ? normalizeUrl(canonicals[0], base) : null,
    canonicalCount: canonicals.length,
    h1: $("h1")
      .map((_, element) => squash($(element).text()))
      .get(),
    lang: squash($("html").attr("lang") ?? "") || null,
    hreflang,
    links,
    images: images.length,
    imagesMissingAlt: imagesMissingAlt.length,
    schemaTypes: [...types],
    invalidJsonLd,
    wordCount: words,
    contentHash: words > 0 ? createHash("sha1").update(text.toLowerCase()).digest("hex") : null,
    hasViewport: $('meta[name="viewport" i]').length > 0,
    hasOpenGraph: $('meta[property^="og:" i]').length > 0,
  };
}

/** Directives from an `X-Robots-Tag` header that apply to all crawlers. */
export function headerRobotsDirectives(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(",")
    .map((directive) => directive.trim())
    .filter((directive) => directive.length > 0 && !directive.includes(":"));
}
