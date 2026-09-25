// Site audit: crawling, page facts, rules and scoring. Node-only; import from
// "@seo-geo/core/audit".
export {
  AUDIT_THRESHOLDS,
  HEALTH_SCORE_VERSION,
  analyzeCrawl,
  isIndexable,
  isNoindex,
  type AnalyzeOptions,
  type AuditAnalysis,
  type AuditStats,
  type CitabilityStats,
} from "./analyze.js";
export {
  CITABILITY_FACTORS,
  CITABILITY_SCORE_VERSION,
  CITABILITY_THRESHOLDS,
  CITABILITY_WEIGHTS,
  CITABLE_SCHEMA_TYPES,
  citability,
  citabilityRecommendations,
  type CitabilityData,
  type CitabilityFactor,
  type CitabilityFactorResult,
  type CitabilityInput,
  type CitabilityResult,
} from "./citability.js";
export {
  crawlSite,
  type CrawlFetch,
  type CrawlOptions,
  type CrawlResult,
  type CrawledPage,
  type DiscoveredBy,
} from "./crawler.js";
export { diffIssues, type IssueChange, type IssueRef } from "./diff.js";
export {
  extractPageFacts,
  headerRobotsDirectives,
  type ContentFacts,
  type PageFacts,
  type PageLink,
} from "./html.js";
export {
  ISSUE_CATALOG,
  ISSUE_CODES,
  isIssueCode,
  issueSeverity,
  type AuditIssue,
  type IssueCategory,
  type IssueCode,
  type IssueData,
  type IssueSeverity,
} from "./issues.js";
export {
  AI_SEARCH_CRAWLERS,
  AI_TRAINING_CRAWLERS,
  CRAWLER_TOKEN,
  blockedAiCrawlers,
  parseRobots,
  type RobotsRules,
} from "./robots.js";
export { parseSitemap, sitemapText, type ParsedSitemap } from "./sitemap.js";
export { normalizeUrl, originOf } from "./url.js";
