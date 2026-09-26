import { createHash } from "node:crypto";

import { load, type CheerioAPI } from "cheerio";

import { normalizeUrl } from "./url.js";

export interface PageLink {
  /** Normalized absolute URL. */
  url: string;
  anchor: string;
  nofollow: boolean;
}

/**
 * Signals of how easily AI answers can quote a page, read from its main content (the article
 * or main element when there is one, without navigation, header, footer and forms).
 */
export interface ContentFacts {
  /** First paragraph of the main content with at least eight words (up to 1,000 characters). */
  intro: string | null;
  /** H2 and H3 headings of the main content (up to 100). */
  subheadings: string[];
  /** Lists with at least two items. */
  lists: number;
  /** Tables with at least two rows. */
  tables: number;
  /** An author is named: JSON-LD `author` or Person, `meta name="author"`, or a byline. */
  hasAuthor: boolean;
  /** Latest modification date the page states (ISO 8601). */
  modified: string | null;
  /** Latest publication date the page states (ISO 8601). */
  published: string | null;
  /** Percentages, decimals and other specific figures in the main text. */
  figures: number;
  /** Counts for readability formulas, over the first 3,000 words of the main text. */
  readability: {
    words: number;
    sentences: number;
    /** Vowels: syllables in Turkish. */
    vowels: number;
    /** Estimated English syllables (vowel groups). */
    syllables: number;
  };
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
  content: ContentFacts;
}

const MAX_ANCHOR_LENGTH = 200;
const MIN_INTRO_WORDS = 8;
const MAX_INTRO_LENGTH = 1000;
const MAX_SUBHEADINGS = 100;
const MAX_SUBHEADING_LENGTH = 300;
const READABILITY_WORDS = 3000;
/** Elements that are not part of a page's main content. */
const BOILERPLATE =
  'nav, header, footer, aside, form, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]';
const BYLINE =
  '[itemprop="author"], [rel~="author"], .byline, .author, .post-author, .entry-author';
/** Percentages, decimals, numbers with thousands separators, and integers of two or more
 * digits that are not years. */
const FIGURE =
  /(?<![\p{L}\p{N}])(?:\d+(?:[.,]\d+)?\s?%|%\s?\d+(?:[.,]\d+)?|\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d+|(?!(?:19|20)\d\d(?![\p{N}]))\d{2,})(?![\p{L}\p{N}])/gu;
const TURKISH_VOWELS = /[aeıioöuüâîû]/gu;
const MAX_SCHEMA_DEPTH = 6;

const squash = (text: string) => text.replace(/\s+/gu, " ").trim();

function attribute($: CheerioAPI, selector: string, name: string): string[] {
  return $(selector)
    .map((_, element) => $(element).attr(name) ?? "")
    .get()
    .map((value: string) => squash(value));
}

interface JsonLdFacts {
  types: Set<string>;
  hasAuthor: boolean;
  modified: string[];
  published: string[];
}

function collectJsonLd(value: unknown, facts: JsonLdFacts, depth = 0): void {
  if (depth > MAX_SCHEMA_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonLd(entry, facts, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  for (const name of Array.isArray(type) ? type : [type]) {
    if (typeof name === "string" && name.trim()) facts.types.add(name.trim());
  }
  const author = record.author;
  if (
    (typeof author === "string" && author.trim()) ||
    (author !== null && typeof author === "object")
  ) {
    facts.hasAuthor = true;
  }
  if (typeof record.dateModified === "string") facts.modified.push(record.dateModified);
  if (typeof record.datePublished === "string") facts.published.push(record.datePublished);
  for (const [key, child] of Object.entries(record)) {
    if (key !== "@type" && child !== null && typeof child === "object") {
      collectJsonLd(child, facts, depth + 1);
    }
  }
}

/** The latest valid date among `values`, as ISO 8601. */
function latestDate(values: readonly (string | undefined)[]): string | null {
  let latest: number | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value.trim());
    if (Number.isFinite(time) && (latest === null || time > latest)) latest = time;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

function wordsOf(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Estimated English syllables of a word: vowel groups, less a silent final "e". */
function englishSyllables(word: string): number {
  const lower = word.toLowerCase();
  const groups = lower.match(/[aeiouy]+/g)?.length ?? 0;
  const silentE = lower.length > 2 && lower.endsWith("e") && !lower.endsWith("le") ? 1 : 0;
  return Math.max(1, groups - silentE);
}

function readabilityCounts(text: string): ContentFacts["readability"] {
  const words: string[] = [];
  let end = text.length;
  for (const match of text.matchAll(WORD)) {
    if (words.length === READABILITY_WORDS) {
      end = match.index;
      break;
    }
    words.push(match[0]);
  }
  if (words.length === 0) return { words: 0, sentences: 0, vowels: 0, syllables: 0 };
  const sentences = text
    .slice(0, end)
    .split(/[.!?…]+(?=\s|$)|\n+/u)
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence)).length;
  let vowels = 0;
  let syllables = 0;
  for (const word of words) {
    vowels += word.toLocaleLowerCase("tr").match(TURKISH_VOWELS)?.length ?? 0;
    syllables += englishSyllables(word);
  }
  return { words: words.length, sentences: Math.max(1, sentences), vowels, syllables };
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

  const jsonLd: JsonLdFacts = { types: new Set(), hasAuthor: false, modified: [], published: [] };
  let invalidJsonLd = 0;
  $('script[type="application/ld+json" i]').each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      collectJsonLd(JSON.parse(text), jsonLd);
    } catch {
      invalidJsonLd++;
    }
  });
  const types = jsonLd.types;
  const metaAuthor = attribute($, 'meta[name="author" i]', "content").some(Boolean);
  const modified = latestDate([
    ...jsonLd.modified,
    ...attribute(
      $,
      'meta[property="article:modified_time" i], meta[property="og:updated_time" i]',
      "content",
    ),
    ...attribute($, '[itemprop="dateModified"]', "content"),
    ...attribute($, 'time[itemprop="dateModified"]', "datetime"),
  ]);
  const published = latestDate([
    ...jsonLd.published,
    ...attribute($, 'meta[property="article:published_time" i]', "content"),
    ...attribute($, '[itemprop="datePublished"]', "content"),
    ...attribute($, 'time[itemprop="datePublished"]', "datetime"),
  ]);

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
  const hasByline = $(BYLINE)
    .toArray()
    .some((element) => squash($(element).text()) !== "");

  const facts: Omit<PageFacts, "content"> = {
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
  // Last: it removes headers, navigation and footers from the document, and a page's H1
  // often sits in the header of its article.
  const content = extractContent($, {
    hasAuthor: jsonLd.hasAuthor || types.has("Person") || metaAuthor || hasByline,
    modified,
    published,
  });
  return { ...facts, content };
}

/**
 * The main content: the only `article`, else `main`, else the body, without boilerplate.
 * Mutates the document (boilerplate is removed); call after everything else is read.
 */
function extractContent(
  $: CheerioAPI,
  known: Pick<ContentFacts, "hasAuthor" | "modified" | "published">,
): ContentFacts {
  const articles = $("article");
  const main = $('main, [role="main"]').first();
  const root = articles.length === 1 ? articles.first() : main.length > 0 ? main : $("body");
  root.find(BOILERPLATE).remove();

  let intro: string | null = null;
  root.find("p").each((_, element) => {
    const paragraph = squash($(element).text());
    if (wordsOf(paragraph).length >= MIN_INTRO_WORDS) {
      intro = paragraph.slice(0, MAX_INTRO_LENGTH);
      return false;
    }
    return undefined;
  });
  const subheadings = root
    .find("h2, h3")
    .map((_, element) => squash($(element).text()).slice(0, MAX_SUBHEADING_LENGTH))
    .get()
    .filter((heading: string) => heading !== "")
    .slice(0, MAX_SUBHEADINGS);
  const lists = root
    .find("ul, ol")
    .filter((_, element) => $(element).children("li").length >= 2).length;
  const tables = root
    .find("table")
    .filter((_, element) => $(element).find("tr").length >= 2).length;

  // Block elements end sentences even without punctuation (headings, list items, cells).
  root.find("h1, h2, h3, h4, h5, h6, p, li, td, th, dt, dd, br, div").after("\n");
  const text = root
    .text()
    .replace(/[^\S\n]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
  return {
    intro,
    subheadings,
    lists,
    tables,
    ...known,
    figures: text.match(FIGURE)?.length ?? 0,
    readability: readabilityCounts(text),
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
