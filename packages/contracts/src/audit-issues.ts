import type { IssueSeverity } from "./domain.js";
import type { IssueCategory } from "./site-audit.js";

interface IssueDefinition {
  severity: IssueSeverity;
  category: IssueCategory;
  /** Site-wide issues have no page. */
  scope: "page" | "site";
}

/**
 * Every issue the site audit reports. Titles, explanations and fixes are translated in the
 * web app under `siteAudit.issues.<code>`. Adding a code here needs those texts too.
 */
export const ISSUE_CATALOG = {
  // Crawlability
  page_4xx: { severity: "ERROR", category: "crawlability", scope: "page" },
  page_5xx: { severity: "ERROR", category: "crawlability", scope: "page" },
  fetch_failed: { severity: "ERROR", category: "crawlability", scope: "page" },
  redirect_loop: { severity: "ERROR", category: "crawlability", scope: "page" },
  redirect_chain: { severity: "WARNING", category: "crawlability", scope: "page" },
  blocked_by_robots: { severity: "NOTICE", category: "crawlability", scope: "page" },
  no_https: { severity: "ERROR", category: "crawlability", scope: "site" },
  robots_txt_unreachable: { severity: "WARNING", category: "crawlability", scope: "site" },
  robots_txt_missing: { severity: "NOTICE", category: "crawlability", scope: "site" },
  sitemap_missing: { severity: "WARNING", category: "crawlability", scope: "site" },
  sitemap_non_200: { severity: "WARNING", category: "crawlability", scope: "page" },
  // Indexability
  canonical_broken: { severity: "ERROR", category: "indexability", scope: "page" },
  canonical_multiple: { severity: "WARNING", category: "indexability", scope: "page" },
  sitemap_noindex: { severity: "WARNING", category: "indexability", scope: "page" },
  noindex_page: { severity: "NOTICE", category: "indexability", scope: "page" },
  canonicalized: { severity: "NOTICE", category: "indexability", scope: "page" },
  canonical_missing: { severity: "NOTICE", category: "indexability", scope: "page" },
  // Content
  title_missing: { severity: "ERROR", category: "content", scope: "page" },
  title_duplicate: { severity: "WARNING", category: "content", scope: "page" },
  title_too_long: { severity: "WARNING", category: "content", scope: "page" },
  title_too_short: { severity: "NOTICE", category: "content", scope: "page" },
  meta_description_missing: { severity: "WARNING", category: "content", scope: "page" },
  meta_description_duplicate: { severity: "WARNING", category: "content", scope: "page" },
  meta_description_too_long: { severity: "NOTICE", category: "content", scope: "page" },
  h1_missing: { severity: "WARNING", category: "content", scope: "page" },
  h1_multiple: { severity: "NOTICE", category: "content", scope: "page" },
  content_duplicate: { severity: "WARNING", category: "content", scope: "page" },
  content_thin: { severity: "NOTICE", category: "content", scope: "page" },
  images_missing_alt: { severity: "WARNING", category: "content", scope: "page" },
  lang_missing: { severity: "NOTICE", category: "content", scope: "page" },
  // Links
  broken_internal_links: { severity: "ERROR", category: "links", scope: "page" },
  links_to_redirects: { severity: "NOTICE", category: "links", scope: "page" },
  nofollow_internal_links: { severity: "NOTICE", category: "links", scope: "page" },
  orphan_page: { severity: "NOTICE", category: "links", scope: "page" },
  deep_page: { severity: "NOTICE", category: "links", scope: "page" },
  // Performance
  slow_response: { severity: "WARNING", category: "performance", scope: "page" },
  page_too_large: { severity: "WARNING", category: "performance", scope: "page" },
  viewport_missing: { severity: "WARNING", category: "performance", scope: "page" },
  // Structured data
  structured_data_invalid: { severity: "WARNING", category: "structured_data", scope: "page" },
  structured_data_missing: { severity: "NOTICE", category: "structured_data", scope: "page" },
  // AI search (GEO)
  ai_search_crawlers_blocked: { severity: "WARNING", category: "ai_search", scope: "site" },
  ai_training_crawlers_blocked: { severity: "NOTICE", category: "ai_search", scope: "site" },
  llms_txt_missing: { severity: "NOTICE", category: "ai_search", scope: "site" },
} as const satisfies Record<string, IssueDefinition>;

export type IssueCode = keyof typeof ISSUE_CATALOG;

export const ISSUE_CODES = Object.keys(ISSUE_CATALOG) as IssueCode[];

export function issueSeverity(code: IssueCode): IssueSeverity {
  return ISSUE_CATALOG[code].severity;
}

export function isIssueCode(value: string): value is IssueCode {
  return Object.hasOwn(ISSUE_CATALOG, value);
}
