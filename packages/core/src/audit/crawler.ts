import { SafeFetchError, type SafeFetchOptions, type SafeResponse } from "../net/safe-fetch.js";
import { extractPageFacts, headerRobotsDirectives, type PageFacts } from "./html.js";
import { AI_SEARCH_CRAWLERS, blockedAiCrawlers, parseRobots, type RobotsRules } from "./robots.js";
import { parseSitemap, sitemapText } from "./sitemap.js";
import { normalizeUrl, originOf } from "./url.js";

export type CrawlFetch = (url: string, options: SafeFetchOptions) => Promise<SafeResponse>;

export interface CrawlOptions {
  startUrl: string;
  /** Whether a URL belongs to the audited site (and may be crawled). */
  isInternal: (url: string) => boolean;
  maxPages: number;
  /** Clicks from the start page. */
  maxDepth: number;
  fetch: CrawlFetch;
  /** Parallel requests; one when robots.txt sets a crawl delay. Defaults to 3. */
  concurrency?: number;
  /** Per page; defaults to 15 s. */
  timeoutMs?: number;
  /** Largest HTML page read; defaults to 5 MiB. */
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (crawled: number) => void | Promise<void>;
  /** Replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type DiscoveredBy = "start" | "link" | "redirect" | "sitemap";

export interface CrawledPage {
  url: string;
  /** Clicks from the start page; -1 for pages only listed in a sitemap. */
  depth: number;
  discoveredBy: DiscoveredBy;
  status: number | null;
  /** Why no response was received, or `blocked_by_robots`. */
  fetchError: string | null;
  contentType: string | null;
  redirectTarget: string | null;
  loadMs: number | null;
  bytes: number | null;
  /** HTML pages with status 200 only. */
  facts: PageFacts | null;
  /** From the `X-Robots-Tag` header. */
  headerRobots: string[];
  inSitemap: boolean;
  /** AI search crawlers that robots.txt keeps away from this page (HTML pages only). */
  blockedAiSearch: string[];
}

export interface CrawlResult {
  /** The normalized start URL. */
  startUrl: string;
  pages: CrawledPage[];
  robots: {
    url: string;
    status: number | null;
    found: boolean;
    /** 5xx or no response: the crawl went ahead without rules. */
    unreachable: boolean;
    crawlDelaySeconds: number | null;
    blockedAi: { search: string[]; training: string[] };
  };
  sitemaps: { read: string[]; failed: string[]; urls: number };
  llmsTxt: { found: boolean; status: number | null };
  stoppedBy: "complete" | "max_pages" | "aborted";
}

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const MAX_SITEMAPS = 25;
const MAX_SITEMAP_URLS = 50_000;
const ROBOTS_MAX_BYTES = 512 * 1024;
const SITEMAP_MAX_BYTES = 20 * 1024 * 1024;

interface QueueEntry {
  url: string;
  depth: number;
  discoveredBy: DiscoveredBy;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Crawls a site breadth-first within page and depth limits, honoring robots.txt. Links are
 * followed first; URLs found only in sitemaps are crawled with the remaining budget.
 * Every request goes through `options.fetch` (the safe fetcher in production).
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const startUrl = normalizeUrl(options.startUrl);
  if (!startUrl) throw new Error(`Invalid start URL: ${options.startUrl}`);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const origin = originOf(startUrl);

  const robotsByOrigin = new Map<string, Promise<RobotsRules>>();
  const robotsInfo: CrawlResult["robots"] = {
    url: `${origin}/robots.txt`,
    status: null,
    found: false,
    unreachable: false,
    crawlDelaySeconds: null,
    blockedAi: { search: [], training: [] },
  };

  const fetchRobots = async (target: string): Promise<RobotsRules> => {
    const robotsUrl = `${target}/robots.txt`;
    let status: number | null = null;
    let content: string | null = null;
    let unreachable = false;
    try {
      const response = await options.fetch(robotsUrl, {
        maxBytes: ROBOTS_MAX_BYTES,
        timeoutMs,
        signal: options.signal,
      });
      status = response.status;
      if (status === 200) content = response.text();
      else if (status >= 500) unreachable = true;
    } catch {
      unreachable = true;
    }
    const rules = parseRobots(robotsUrl, content);
    if (target === origin) {
      Object.assign(robotsInfo, {
        status,
        found: rules.found,
        unreachable,
        crawlDelaySeconds: rules.crawlDelaySeconds,
        blockedAi: blockedAiCrawlers(rules, startUrl),
      });
    }
    return rules;
  };
  const robotsFor = (url: string): Promise<RobotsRules> => {
    const key = originOf(url);
    let rules = robotsByOrigin.get(key);
    if (!rules) {
      rules = fetchRobots(key);
      robotsByOrigin.set(key, rules);
    }
    return rules;
  };

  const startRules = await robotsFor(startUrl);
  const sitemapInfo = await readSitemaps(options, origin, startRules, timeoutMs);
  const llmsTxt = await probeLlmsTxt(options, origin, timeoutMs);

  const pages = new Map<string, CrawledPage>();
  const seen = new Set<string>([startUrl]);
  const linkQueue: QueueEntry[] = [{ url: startUrl, depth: 0, discoveredBy: "start" }];
  const sitemapQueue: QueueEntry[] = [];
  for (const url of sitemapInfo.urls) {
    if (!seen.has(url) && options.isInternal(url)) {
      sitemapQueue.push({ url, depth: -1, discoveredBy: "sitemap" });
    }
  }
  const queuedFromSitemap = new Set(sitemapQueue.map((entry) => entry.url));

  const delayMs = (startRules.crawlDelaySeconds ?? 0) * 1000;
  const concurrency = delayMs > 0 ? 1 : Math.max(1, options.concurrency ?? 3);
  let started = 0;

  const enqueue = (url: string, depth: number, discoveredBy: DiscoveredBy) => {
    if (queuedFromSitemap.delete(url)) {
      // Found by a link after all: crawl it in link order with its real depth. Its sitemap
      // queue entry is skipped when reached.
      seen.add(url);
      linkQueue.push({ url, depth, discoveredBy });
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    linkQueue.push({ url, depth, discoveredBy });
  };

  let active = 0;
  const next = (): QueueEntry | undefined => {
    const linked = linkQueue.shift();
    if (linked) return linked;
    // Sitemap URLs wait until link discovery is done, so linked pages get their real depth.
    if (active > 0) return undefined;
    for (let entry = sitemapQueue.shift(); entry; entry = sitemapQueue.shift()) {
      if (!queuedFromSitemap.delete(entry.url)) continue;
      seen.add(entry.url);
      return entry;
    }
    return undefined;
  };
  const hasQueued = () => linkQueue.length > 0 || queuedFromSitemap.size > 0;

  const crawlOne = async (entry: QueueEntry): Promise<void> => {
    const page: CrawledPage = {
      url: entry.url,
      depth: entry.depth,
      discoveredBy: entry.discoveredBy,
      status: null,
      fetchError: null,
      contentType: null,
      redirectTarget: null,
      loadMs: null,
      bytes: null,
      facts: null,
      headerRobots: [],
      inSitemap: sitemapInfo.urls.has(entry.url),
      blockedAiSearch: [],
    };
    pages.set(entry.url, page);

    const rules = await robotsFor(entry.url);
    if (!rules.isAllowed(entry.url)) {
      page.fetchError = "blocked_by_robots";
      return;
    }
    const startedAt = now();
    let response: SafeResponse;
    try {
      response = await options.fetch(entry.url, {
        redirect: "manual",
        timeoutMs,
        maxBytes,
        signal: options.signal,
        headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
        readBodyIf: (contentType) => contentType !== null && HTML_TYPES.has(contentType),
      });
    } catch (error) {
      page.fetchError = error instanceof SafeFetchError ? error.reason : "network";
      page.loadMs = now() - startedAt;
      return;
    }
    page.loadMs = now() - startedAt;
    page.status = response.status;
    page.contentType = response.contentType;
    page.bytes = response.body.length || Number(response.headers["content-length"]) || null;
    page.headerRobots = headerRobotsDirectives(response.headers["x-robots-tag"]);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      const target = location ? normalizeUrl(location, entry.url) : null;
      page.redirectTarget = target;
      if (target && options.isInternal(target)) enqueue(target, entry.depth, "redirect");
      return;
    }
    if (
      response.status === 200 &&
      response.contentType !== null &&
      HTML_TYPES.has(response.contentType)
    ) {
      page.facts = extractPageFacts(response.text(), entry.url);
      page.blockedAiSearch = AI_SEARCH_CRAWLERS.filter((bot) => !rules.isAllowed(entry.url, bot));
      const depth = entry.depth < 0 ? -1 : entry.depth + 1;
      if (entry.depth >= 0 && depth > options.maxDepth) return;
      for (const link of page.facts.links) {
        if (options.isInternal(link.url)) enqueue(link.url, depth, "link");
      }
    }
  };

  const worker = async (): Promise<void> => {
    while (!options.signal?.aborted && started < options.maxPages) {
      const entry = next();
      if (!entry) {
        // Pages still being crawled may add links; wait for them before stopping.
        if (active === 0) return;
        await defaultSleep(5);
        continue;
      }
      started++;
      active++;
      try {
        await crawlOne(entry);
      } finally {
        active--;
      }
      await options.onProgress?.(pages.size);
      if (delayMs > 0) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  let stoppedBy: CrawlResult["stoppedBy"] = "complete";
  if (options.signal?.aborted) stoppedBy = "aborted";
  else if (hasQueued()) stoppedBy = "max_pages";

  return {
    startUrl,
    pages: [...pages.values()],
    robots: robotsInfo,
    sitemaps: {
      read: sitemapInfo.read,
      failed: sitemapInfo.failed,
      urls: sitemapInfo.urls.size,
    },
    llmsTxt,
    stoppedBy,
  };
}

async function readSitemaps(
  options: CrawlOptions,
  origin: string,
  robots: RobotsRules,
  timeoutMs: number,
): Promise<{ read: string[]; failed: string[]; urls: Set<string> }> {
  const listed = robots.sitemaps
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => url !== null && options.isInternal(url));
  const pending = listed.length > 0 ? listed : [`${origin}/sitemap.xml`];
  const visited = new Set<string>();
  const read: string[] = [];
  const failed: string[] = [];
  const urls = new Set<string>();

  while (pending.length > 0 && visited.size < MAX_SITEMAPS && urls.size < MAX_SITEMAP_URLS) {
    const sitemapUrl = pending.shift() as string;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    try {
      const response = await options.fetch(sitemapUrl, {
        maxBytes: SITEMAP_MAX_BYTES,
        timeoutMs: timeoutMs * 2,
        signal: options.signal,
      });
      if (response.status !== 200) {
        // A missing default sitemap is not a failure; a listed one is.
        if (listed.length > 0) failed.push(sitemapUrl);
        continue;
      }
      const parsed = parseSitemap(sitemapText(response.body));
      if (parsed.kind === "invalid") {
        failed.push(sitemapUrl);
        continue;
      }
      read.push(sitemapUrl);
      for (const location of parsed.locations) {
        const url = normalizeUrl(location, sitemapUrl);
        if (!url) continue;
        if (parsed.kind === "sitemapindex") pending.push(url);
        else if (urls.size < MAX_SITEMAP_URLS) urls.add(url);
      }
    } catch {
      failed.push(sitemapUrl);
    }
  }
  return { read, failed, urls };
}

async function probeLlmsTxt(
  options: CrawlOptions,
  origin: string,
  timeoutMs: number,
): Promise<{ found: boolean; status: number | null }> {
  try {
    const response = await options.fetch(`${origin}/llms.txt`, {
      maxBytes: 256 * 1024,
      timeoutMs,
      signal: options.signal,
    });
    const isText = response.contentType === null || response.contentType.startsWith("text/");
    const looksLikeHtml = /^\s*</u.test(response.text().slice(0, 100));
    return {
      found: response.status === 200 && isText && !looksLikeHtml,
      status: response.status,
    };
  } catch {
    return { found: false, status: null };
  }
}
