import robotsParserModule from "robots-parser";

// robots-parser is CommonJS (`module.exports = function`) but its types declare a default
// export; at runtime the default import is the function itself.
const robotsParser = robotsParserModule as unknown as typeof robotsParserModule.default;

/** The user-agent token the crawler matches in robots.txt. */
export const CRAWLER_TOKEN = "SEO-GEO-Bot";

/**
 * Crawlers that fetch pages to answer questions in AI search (ChatGPT search, Perplexity,
 * Claude). Blocking them keeps a site out of those answers.
 */
export const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
] as const;

/** Crawlers that collect training data for AI models; blocking them is a policy choice. */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
] as const;

/** Longest crawl delay honored, in seconds. */
const MAX_CRAWL_DELAY_SECONDS = 10;

export interface RobotsRules {
  /** Whether robots.txt was found (HTTP 200). */
  found: boolean;
  isAllowed(url: string, userAgent?: string): boolean;
  /** Crawl-delay for this crawler, capped; `null` when none is set. */
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

/** Parses robots.txt; `null` content (missing file) allows everything. */
export function parseRobots(robotsUrl: string, content: string | null): RobotsRules {
  const robots = robotsParser(robotsUrl, content ?? "");
  const delay = robots.getCrawlDelay(CRAWLER_TOKEN);
  return {
    found: content !== null,
    isAllowed: (url, userAgent = CRAWLER_TOKEN) => robots.isAllowed(url, userAgent) !== false,
    crawlDelaySeconds:
      typeof delay === "number" && Number.isFinite(delay) && delay > 0
        ? Math.min(delay, MAX_CRAWL_DELAY_SECONDS)
        : null,
    sitemaps: robots.getSitemaps(),
  };
}

/** AI crawlers that may not fetch `url`. */
export function blockedAiCrawlers(
  rules: RobotsRules,
  url: string,
): { search: string[]; training: string[] } {
  return {
    search: AI_SEARCH_CRAWLERS.filter((bot) => !rules.isAllowed(url, bot)),
    training: AI_TRAINING_CRAWLERS.filter((bot) => !rules.isAllowed(url, bot)),
  };
}
