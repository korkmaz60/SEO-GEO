import type { CrawledPage, CrawlResult } from "./crawler.js";
import { issueSeverity, type AuditIssue, type IssueCode, type IssueData } from "./issues.js";

/** Version of the health score formula; stored with every run. */
export const HEALTH_SCORE_VERSION = 1;

export const AUDIT_THRESHOLDS = {
  titleMaxLength: 60,
  titleMinLength: 15,
  descriptionMaxLength: 160,
  thinContentWords: 200,
  slowResponseMs: 2000,
  largePageBytes: 2 * 1024 * 1024,
  deepPageClicks: 3,
  /** Example URLs kept in an issue's data. */
  examples: 5,
} as const;

export interface AuditStats {
  crawled: number;
  blocked: number;
  html: number;
  indexable: number;
  status: { "2xx": number; "3xx": number; "4xx": number; "5xx": number; failed: number };
  issues: { ERROR: number; WARNING: number; NOTICE: number };
  pagesWithErrors: number;
  pagesWithWarnings: number;
}

export interface AuditAnalysis {
  issues: AuditIssue[];
  /** Crawled pages linking to each URL (distinct pages, self-links excluded). */
  inlinks: Map<string, number>;
  healthScore: number | null;
  stats: AuditStats;
}

const NOINDEX = new Set(["noindex", "none"]);

export function isNoindex(page: CrawledPage): boolean {
  return (
    page.headerRobots.some((directive) => NOINDEX.has(directive)) ||
    (page.facts?.robotsDirectives ?? []).some((directive) => NOINDEX.has(directive))
  );
}

/** HTML with status 200, no noindex, and no canonical pointing elsewhere. */
export function isIndexable(page: CrawledPage): boolean {
  if (page.status !== 200 || !page.facts || isNoindex(page)) return false;
  return page.facts.canonical === null || page.facts.canonical === page.url;
}

const isBroken = (page: CrawledPage | undefined) =>
  page !== undefined &&
  page.fetchError !== "blocked_by_robots" &&
  (page.fetchError !== null || (page.status !== null && page.status >= 400));

const isRedirect = (page: CrawledPage | undefined) =>
  page !== undefined && page.status !== null && page.status >= 300 && page.status < 400;

/** Applies the audit rules to a crawl and computes the health score. */
export function analyzeCrawl(result: CrawlResult): AuditAnalysis {
  const pages = new Map(result.pages.map((page) => [page.url, page]));
  const issues: AuditIssue[] = [];
  const add = (code: IssueCode, url: string | null, data?: IssueData) =>
    issues.push(data ? { code, url, data } : { code, url });

  // Link graph between crawled pages.
  const inlinks = new Map<string, number>();
  for (const page of result.pages) {
    if (!page.facts) continue;
    const targets = new Set(page.facts.links.map((link) => link.url));
    targets.delete(page.url);
    for (const target of targets) {
      if (pages.has(target)) inlinks.set(target, (inlinks.get(target) ?? 0) + 1);
    }
  }

  for (const page of result.pages) {
    evaluatePage(page, pages, inlinks, add);
  }
  evaluateDuplicates(result.pages, add);
  evaluateSite(result, pages, add);

  return { issues, inlinks, ...score(result.pages, issues) };
}

function evaluatePage(
  page: CrawledPage,
  pages: Map<string, CrawledPage>,
  inlinks: Map<string, number>,
  add: (code: IssueCode, url: string | null, data?: IssueData) => void,
): void {
  const { url } = page;
  if (page.fetchError === "blocked_by_robots") {
    add("blocked_by_robots", url);
    return;
  }
  if (page.fetchError) add("fetch_failed", url, { reason: page.fetchError });
  if (page.status !== null && page.status >= 400) {
    add(page.status >= 500 ? "page_5xx" : "page_4xx", url, { status: page.status });
  }
  if (isRedirect(page)) {
    const chain = redirectChain(page, pages);
    if (chain.loop) add("redirect_loop", url, { chain: chain.urls });
    else if (chain.urls.length > 2) add("redirect_chain", url, { hops: chain.urls.length - 1 });
  }
  if (page.inSitemap) {
    if (page.status !== 200) add("sitemap_non_200", url, { status: page.status ?? 0 });
    else if (isNoindex(page)) add("sitemap_noindex", url);
    if (page.discoveredBy === "sitemap" && (inlinks.get(url) ?? 0) === 0) add("orphan_page", url);
  }
  if (page.loadMs !== null && page.loadMs > AUDIT_THRESHOLDS.slowResponseMs) {
    add("slow_response", url, { ms: Math.round(page.loadMs) });
  }

  const facts = page.facts;
  if (!facts || page.status !== 200) return;
  const indexable = isIndexable(page);

  if (!facts.title) add("title_missing", url);
  else if (facts.title.length > AUDIT_THRESHOLDS.titleMaxLength) {
    add("title_too_long", url, { length: facts.title.length });
  } else if (facts.title.length < AUDIT_THRESHOLDS.titleMinLength) {
    add("title_too_short", url, { length: facts.title.length });
  }
  if (!facts.metaDescription) add("meta_description_missing", url);
  else if (facts.metaDescription.length > AUDIT_THRESHOLDS.descriptionMaxLength) {
    add("meta_description_too_long", url, { length: facts.metaDescription.length });
  }
  const headings = facts.h1.filter(Boolean);
  if (headings.length === 0) add("h1_missing", url);
  else if (headings.length > 1) add("h1_multiple", url, { count: headings.length });

  if (isNoindex(page)) add("noindex_page", url);
  if (facts.canonicalCount > 1) add("canonical_multiple", url, { count: facts.canonicalCount });
  if (facts.canonical && facts.canonical !== url) {
    const target = pages.get(facts.canonical);
    if (isBroken(target) || isRedirect(target)) {
      add("canonical_broken", url, { canonical: facts.canonical, status: target?.status ?? 0 });
    } else {
      add("canonicalized", url, { canonical: facts.canonical });
    }
  } else if (!facts.canonical && indexable) {
    add("canonical_missing", url);
  }

  if (indexable && facts.wordCount < AUDIT_THRESHOLDS.thinContentWords) {
    add("content_thin", url, { words: facts.wordCount });
  }
  if (facts.imagesMissingAlt > 0) {
    add("images_missing_alt", url, { count: facts.imagesMissingAlt, images: facts.images });
  }
  if (!facts.lang) add("lang_missing", url);
  if (!facts.hasViewport) add("viewport_missing", url);
  if (facts.invalidJsonLd > 0) add("structured_data_invalid", url, { count: facts.invalidJsonLd });
  if (indexable && facts.schemaTypes.length === 0) add("structured_data_missing", url);
  if (page.bytes !== null && page.bytes > AUDIT_THRESHOLDS.largePageBytes) {
    add("page_too_large", url, { bytes: page.bytes });
  }
  if (indexable && page.depth > AUDIT_THRESHOLDS.deepPageClicks) {
    add("deep_page", url, { depth: page.depth });
  }

  const internal = [...new Map(facts.links.map((link) => [link.url, link])).values()].filter(
    (link) => link.url !== url && pages.has(link.url),
  );
  const broken = internal.filter((link) => isBroken(pages.get(link.url)));
  if (broken.length > 0) {
    add("broken_internal_links", url, {
      count: broken.length,
      urls: broken.slice(0, AUDIT_THRESHOLDS.examples).map((link) => link.url),
    });
  }
  const redirected = internal.filter((link) => isRedirect(pages.get(link.url)));
  if (redirected.length > 0) {
    add("links_to_redirects", url, {
      count: redirected.length,
      urls: redirected.slice(0, AUDIT_THRESHOLDS.examples).map((link) => link.url),
    });
  }
  const nofollow = facts.links.filter((link) => link.nofollow && pages.has(link.url));
  if (nofollow.length > 0) add("nofollow_internal_links", url, { count: nofollow.length });
}

function redirectChain(
  page: CrawledPage,
  pages: Map<string, CrawledPage>,
): { urls: string[]; loop: boolean } {
  const urls = [page.url];
  let current: CrawledPage | undefined = page;
  while (current && isRedirect(current) && current.redirectTarget) {
    if (urls.includes(current.redirectTarget)) return { urls, loop: true };
    urls.push(current.redirectTarget);
    current = pages.get(current.redirectTarget);
  }
  return { urls, loop: false };
}

function evaluateDuplicates(
  pages: readonly CrawledPage[],
  add: (code: IssueCode, url: string | null, data?: IssueData) => void,
): void {
  const indexable = pages.filter(isIndexable);
  const groups = (code: IssueCode, key: (page: CrawledPage) => string | null | undefined): void => {
    const byKey = new Map<string, string[]>();
    for (const page of indexable) {
      const value = key(page);
      if (!value) continue;
      const list = byKey.get(value) ?? [];
      list.push(page.url);
      byKey.set(value, list);
    }
    for (const urls of byKey.values()) {
      if (urls.length < 2) continue;
      for (const url of urls) {
        add(code, url, {
          count: urls.length,
          urls: urls.filter((other) => other !== url).slice(0, AUDIT_THRESHOLDS.examples),
        });
      }
    }
  };
  groups("title_duplicate", (page) => page.facts?.title?.toLowerCase());
  groups("meta_description_duplicate", (page) => page.facts?.metaDescription?.toLowerCase());
  groups("content_duplicate", (page) => page.facts?.contentHash);
}

function evaluateSite(
  result: CrawlResult,
  pages: Map<string, CrawledPage>,
  add: (code: IssueCode, url: string | null, data?: IssueData) => void,
): void {
  const start = pages.get(result.startUrl);
  const final = start ? redirectChain(start, pages).urls.at(-1) : result.startUrl;
  if (final?.startsWith("http:")) add("no_https", null);
  if (result.robots.unreachable) add("robots_txt_unreachable", null);
  else if (!result.robots.found) add("robots_txt_missing", null);
  if (result.sitemaps.read.length === 0) add("sitemap_missing", null);
  if (!result.llmsTxt.found) add("llms_txt_missing", null);
  if (result.robots.blockedAi.search.length > 0) {
    add("ai_search_crawlers_blocked", null, { bots: result.robots.blockedAi.search });
  }
  if (result.robots.blockedAi.training.length > 0) {
    add("ai_training_crawlers_blocked", null, { bots: result.robots.blockedAi.training });
  }
}

/**
 * Health score v1: `round(100 × (1 − (pages with errors + 0.5 × pages with only warnings) /
 * crawled pages))`, over pages that were requested (not blocked by robots.txt).
 */
function score(
  pages: readonly CrawledPage[],
  issues: readonly AuditIssue[],
): { healthScore: number | null; stats: AuditStats } {
  const crawled = pages.filter((page) => page.fetchError !== "blocked_by_robots");
  const errors = new Set<string>();
  const warnings = new Set<string>();
  const counts = { ERROR: 0, WARNING: 0, NOTICE: 0 };
  for (const issue of issues) {
    const severity = issueSeverity(issue.code);
    counts[severity]++;
    if (!issue.url) continue;
    if (severity === "ERROR") errors.add(issue.url);
    else if (severity === "WARNING") warnings.add(issue.url);
  }
  const onlyWarnings = [...warnings].filter((url) => !errors.has(url)).length;
  const healthScore =
    crawled.length === 0
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(100 * (1 - (errors.size + 0.5 * onlyWarnings) / crawled.length)),
          ),
        );

  const status = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, failed: 0 };
  for (const page of crawled) {
    if (page.status === null) status.failed++;
    else if (page.status >= 500) status["5xx"]++;
    else if (page.status >= 400) status["4xx"]++;
    else if (page.status >= 300) status["3xx"]++;
    else status["2xx"]++;
  }
  return {
    healthScore,
    stats: {
      crawled: crawled.length,
      blocked: pages.length - crawled.length,
      html: crawled.filter((page) => page.facts !== null).length,
      indexable: crawled.filter(isIndexable).length,
      status,
      issues: counts,
      pagesWithErrors: errors.size,
      pagesWithWarnings: onlyWarnings,
    },
  };
}
