import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  analyzeCrawl,
  crawlSite,
  diffIssues,
  extractPageFacts,
  normalizeUrl,
  parseRobots,
  parseSitemap,
  sitemapText,
  type AuditIssue,
  type CrawlResult,
} from "../src/audit/index.js";
import { createSafeFetcher, type LookupFunction, type SafeFetcher } from "../src/net/index.js";

const layout = (body: string, head = "") =>
  `<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width">${head}</head><body>${body}</body></html>`;
const words = (count: number) => Array.from({ length: count }, (_, i) => `kelime${i}`).join(" ");
const jsonLd =
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>';

/** A small site with one of each problem. */
const SITE: Record<
  string,
  { status?: number; type?: string; body?: string; headers?: Record<string, string> }
> = {
  "/": {
    body: layout(
      `<h1>Ana sayfa</h1><p>${words(250)}</p>
       <a href="/hakkinda">Hakkında</a> <a href="/urunler?utm_source=x#top">Ürünler</a>
       <a href="/eski">Eski</a> <a href="/yok">Kırık</a> <a href="/gizli">Gizli</a>
       <a href="https://other.example.net/">Dış</a> <a href="mailto:a@b.c">Posta</a>
       <a href="/zincir-1" rel="nofollow">Zincir</a> <a href="/belge.pdf">PDF</a>`,
      `<title>Örnek Mağaza — kahve makineleri ve aksesuarları</title>
       <meta name="description" content="Kahve makineleri."><link rel="canonical" href="/">${jsonLd}`,
    ),
  },
  "/hakkinda": {
    body: layout(
      `<h1>Hakkında</h1><h1>İkinci başlık</h1><p>${words(40)}</p><img src="/a.png"><a href="/">Ana</a>`,
      `<title>Örnek Mağaza — kahve makineleri ve aksesuarları</title>`,
    ),
  },
  "/urunler": {
    body: layout(
      `<p>${words(300)}</p><a href="/urunler/kahve">Kahve</a>`,
      `<title>Ürünler</title><meta name="robots" content="noindex, follow">`,
    ),
  },
  "/urunler/kahve": {
    body: layout(
      `<h1>Kahve</h1><p>${words(300)}</p>`,
      `<title>Kahve makineleri | Örnek</title><link rel="canonical" href="/yok">${jsonLd}`,
    ),
  },
  "/eski": { status: 301, headers: { location: "/hakkinda" } },
  "/zincir-1": { status: 301, headers: { location: "/zincir-2" } },
  "/zincir-2": { status: 302, headers: { location: "/" } },
  "/gizli": { body: layout("<h1>Gizli</h1>", "<title>Gizli sayfa başlığı burada</title>") },
  "/belge.pdf": { type: "application/pdf", body: "%PDF-1.4 fake" },
  "/sadece-sitemap": {
    body: layout(
      `<h1>Yetim</h1><p>${words(300)}</p>`,
      "<title>Sitemapte kalan yetim sayfa</title>",
    ),
  },
  "/robots.txt": {
    type: "text/plain",
    body: "User-agent: *\nDisallow: /gizli\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nSitemap: http://site.test:PORT/sitemap_index.xml\n",
  },
  "/sitemap_index.xml": {
    type: "application/xml",
    body: '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>http://site.test:PORT/pages.xml.gz</loc></sitemap></sitemapindex>',
  },
};
const PAGES_SITEMAP =
  '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://site.test:PORT/</loc></url><url><loc>http://site.test:PORT/sadece-sitemap</loc></url><url><loc>http://site.test:PORT/urunler</loc></url><url><loc>http://site.test:PORT/yok</loc></url></urlset>';

let server: Server;
let port: number;
let fetcher: SafeFetcher;

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/pages.xml.gz") {
      response.writeHead(200, { "content-type": "application/x-gzip" });
      response.end(gzipSync(PAGES_SITEMAP.replaceAll("PORT", String(port))));
      return;
    }
    const page = SITE[path];
    if (!page) {
      response.writeHead(404, { "content-type": "text/html" });
      response.end(layout("<h1>Bulunamadı</h1>", "<title>404</title>"));
      return;
    }
    response.writeHead(page.status ?? 200, {
      "content-type": page.type ?? "text/html; charset=utf-8",
      ...page.headers,
    });
    response.end((page.body ?? "").replaceAll("PORT", String(port)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  const lookup: LookupFunction = async (hostname) => {
    if (hostname !== "site.test") throw new Error("ENOTFOUND");
    return [{ address: "127.0.0.1", family: 4 }];
  };
  fetcher = createSafeFetcher({
    lookup,
    isAllowedAddress: (address) => address === "127.0.0.1",
    allowedPorts: [port],
  });
});

afterAll(async () => {
  await fetcher.close();
  await new Promise((resolve) => server.close(resolve));
});

const site = (path: string) => `http://site.test:${port}${path}`;

async function crawl(overrides: { maxPages?: number } = {}): Promise<CrawlResult> {
  return crawlSite({
    startUrl: site("/"),
    isInternal: (url) => new URL(url).host === `site.test:${port}`,
    maxPages: overrides.maxPages ?? 100,
    maxDepth: 5,
    fetch: (url, options) => fetcher.fetch(url, options),
  });
}

const codesFor = (issues: AuditIssue[], path: string | null) =>
  issues
    .filter((issue) => issue.url === (path === null ? null : site(path)))
    .map((issue) => issue.code)
    .sort();

describe("crawlSite and analyzeCrawl", () => {
  it("crawls links first, then sitemap-only pages, honoring robots.txt", async () => {
    const result = await crawl();
    const byUrl = new Map(result.pages.map((page) => [page.url, page]));

    expect(result.stoppedBy).toBe("complete");
    expect(result.robots).toMatchObject({
      found: true,
      blockedAi: { search: ["PerplexityBot"], training: ["GPTBot"] },
    });
    expect(result.sitemaps).toMatchObject({
      read: [site("/sitemap_index.xml"), site("/pages.xml.gz")],
      urls: 4,
    });
    expect(result.llmsTxt.found).toBe(false);

    // Tracking parameters and fragments are dropped before URLs are compared.
    expect(byUrl.get(site("/urunler"))).toMatchObject({ depth: 1, discoveredBy: "link" });
    expect(byUrl.get(site("/urunler/kahve"))).toMatchObject({ depth: 2, status: 200 });
    expect(byUrl.get(site("/gizli"))).toMatchObject({ fetchError: "blocked_by_robots" });
    expect(byUrl.get(site("/eski"))).toMatchObject({
      status: 301,
      redirectTarget: site("/hakkinda"),
    });
    expect(byUrl.get(site("/belge.pdf"))).toMatchObject({
      status: 200,
      contentType: "application/pdf",
      facts: null,
    });
    expect(byUrl.get(site("/sadece-sitemap"))).toMatchObject({
      depth: -1,
      discoveredBy: "sitemap",
      inSitemap: true,
    });
    expect(byUrl.has("https://other.example.net/")).toBe(false);
    expect(result.pages[0]?.url).toBe(site("/"));
  });

  it("reports page and site issues and a health score", async () => {
    const result = await crawl();
    const { issues, healthScore, stats, inlinks } = analyzeCrawl(result);

    expect(codesFor(issues, "/")).toEqual([
      "broken_internal_links",
      "links_to_redirects",
      "nofollow_internal_links",
      "title_duplicate",
    ]);
    expect(codesFor(issues, "/hakkinda")).toEqual([
      "canonical_missing",
      "content_thin",
      "h1_multiple",
      "images_missing_alt",
      "meta_description_missing",
      "structured_data_missing",
      "title_duplicate",
    ]);
    expect(codesFor(issues, "/urunler")).toEqual([
      "h1_missing",
      "meta_description_missing",
      "noindex_page",
      "sitemap_noindex",
      "title_too_short",
    ]);
    expect(codesFor(issues, "/urunler/kahve")).toEqual([
      "canonical_broken",
      "meta_description_missing",
    ]);
    expect(codesFor(issues, "/yok")).toEqual(["page_4xx", "sitemap_non_200"]);
    expect(codesFor(issues, "/zincir-1")).toEqual(["redirect_chain"]);
    expect(codesFor(issues, "/gizli")).toEqual(["blocked_by_robots"]);
    expect(codesFor(issues, "/sadece-sitemap")).toEqual([
      "canonical_missing",
      "meta_description_missing",
      "orphan_page",
      "structured_data_missing",
    ]);
    expect(codesFor(issues, null)).toEqual([
      "ai_search_crawlers_blocked",
      "ai_training_crawlers_blocked",
      "llms_txt_missing",
      "no_https",
    ]);
    const broken = issues.find((issue) => issue.code === "broken_internal_links");
    expect(broken?.data).toEqual({ count: 1, urls: [site("/yok")] });

    expect(inlinks.get(site("/hakkinda"))).toBe(1);
    expect(stats).toMatchObject({
      blocked: 1,
      status: { "3xx": 3, "4xx": 1 },
      pagesWithErrors: 3,
    });
    // Errors on /, /yok and /urunler/kahve; warnings only on /hakkinda, /urunler,
    // /zincir-1 and /sadece-sitemap: 1 − (3 + 0.5 × 4) / crawled.
    expect(healthScore).toBe(Math.round(100 * (1 - (3 + 0.5 * 4) / stats.crawled)));
  });

  it("stops at the page limit", async () => {
    const result = await crawl({ maxPages: 3 });
    expect(result.pages).toHaveLength(3);
    expect(result.stoppedBy).toBe("max_pages");
  });
});

describe("extractPageFacts", () => {
  it("reads head tags, links, headings, images and JSON-LD", () => {
    const facts = extractPageFacts(
      `<html lang="en"><head><base href="/docs/"><title>Docs</title>
       <meta name="ROBOTS" content="NOINDEX, nofollow"><meta name="googlebot" content="noarchive">
       <meta property="og:title" content="x"><link rel="alternate" hreflang="tr" href="/tr/">
       <script type="application/ld+json">{"@graph":[{"@type":"Article"},{"@type":["FAQPage","WebPage"]}]}</script>
       <script type="application/ld+json">{broken</script></head>
       <body><svg><title>icon</title></svg><h1> Getting   started </h1>
       <a href="intro">Intro</a><a href="https://example.com/x" rel="nofollow ugc"><img alt="Logo"></a>
       <img src="a.png" alt=""><img src="b.png"><script>var hidden = "words";</script>
       <p>One two three</p></body></html>`,
      "https://example.com/docs/page",
    );
    expect(facts).toMatchObject({
      title: "Docs",
      titleCount: 1,
      robotsDirectives: ["noindex", "nofollow", "noarchive"],
      h1: ["Getting started"],
      lang: "en",
      hreflang: [{ lang: "tr", href: "https://example.com/tr/" }],
      links: [
        { url: "https://example.com/docs/intro", anchor: "Intro", nofollow: false },
        { url: "https://example.com/x", anchor: "Logo", nofollow: true },
      ],
      images: 3,
      imagesMissingAlt: 1,
      schemaTypes: ["Article", "FAQPage", "WebPage"],
      invalidJsonLd: 1,
      hasOpenGraph: true,
      hasViewport: false,
    });
    // Headings, link text and paragraphs; not scripts, SVG titles or image alt text.
    expect(facts.wordCount).toBe(6);
  });

  // The main content leaves headers out; the page facts are read from the whole page.
  const paragraph = `<p>${words(20)}</p>`;

  it.each([
    ["the article's header", `<article><header><h1>Title</h1></header>${paragraph}</article>`],
    [
      "a site header outside the article",
      `<header><h1>Title</h1></header><article>${paragraph}</article>`,
    ],
    [
      "a site header when the body is the main content",
      `<header><h1>Title</h1></header>${paragraph}`,
    ],
  ])("counts an H1 in %s", (_, body) => {
    const facts = extractPageFacts(layout(body), "https://example.com/blog/post");
    expect(facts.h1).toEqual(["Title"]);
    expect(facts.content.readability.words).toBe(20);
  });

  it("reads meta tags that a page puts in a header of the body", () => {
    const facts = extractPageFacts(
      `<body><header><meta name="viewport" content="width=device-width"><meta property="og:title" content="Title"></header>${paragraph}</body>`,
      "https://example.com/",
    );
    expect(facts).toMatchObject({ hasViewport: true, hasOpenGraph: true });
  });
});

describe("helpers", () => {
  it("normalizes URLs for deduplication", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/a?b=2&utm_source=x&a=1#frag")).toBe(
      "https://example.com/a?a=1&b=2",
    );
    expect(normalizeUrl("../c", "https://example.com/a/b/")).toBe("https://example.com/a/c");
    expect(normalizeUrl("javascript:void(0)")).toBeNull();
    expect(normalizeUrl("mailto:a@example.com")).toBeNull();
  });

  it("parses robots.txt rules and sitemaps", () => {
    const rules = parseRobots(
      "https://example.com/robots.txt",
      "User-agent: *\nDisallow: /private\nCrawl-delay: 60\nSitemap: https://example.com/s.xml",
    );
    expect(rules.isAllowed("https://example.com/private/x")).toBe(false);
    expect(rules.isAllowed("https://example.com/public")).toBe(true);
    expect(rules.crawlDelaySeconds).toBe(10);
    expect(rules.sitemaps).toEqual(["https://example.com/s.xml"]);
    expect(
      parseRobots("https://example.com/robots.txt", null).isAllowed("https://example.com/x"),
    ).toBe(true);

    expect(parseSitemap("<html></html>").kind).toBe("invalid");
    expect(sitemapText(gzipSync("<urlset/>"))).toBe("<urlset/>");
  });

  it("diffs issues between runs", () => {
    const diff = diffIssues(
      [
        { code: "title_missing", url: "https://e.com/a" },
        { code: "title_missing", url: "https://e.com/b" },
        { code: "sitemap_missing", url: null },
      ],
      [
        { code: "title_missing", url: "https://e.com/b" },
        { code: "title_missing", url: "https://e.com/c" },
      ],
    );
    expect(Object.fromEntries(diff)).toEqual({
      title_missing: { new: 1, fixed: 1, persisting: 1 },
      sitemap_missing: { new: 0, fixed: 1, persisting: 0 },
    });
  });
});
