import { z } from "zod";

import { LanguageCodeSchema, LocationCodeSchema } from "./projects.js";
import { SearchIntentSchema } from "./rank-tracker.js";

/** Top keywords and competitors a domain overview includes. */
export const DOMAIN_OVERVIEW_LIMITS = {
  keywords: 100,
  competitors: 10,
  historyMonths: 12,
} as const;

export const DomainOverviewRequestSchema = z.strictObject({
  /** A domain, subdomain or URL; reduced to its host without `www.`. */
  domain: z.string().trim().min(1).max(2048),
  locationCode: LocationCodeSchema,
  languageCode: LanguageCodeSchema,
  /** Load every part again even when it is cached (D23); the quote then covers all parts. */
  refresh: z.boolean().optional(),
});
export type DomainOverviewRequest = z.infer<typeof DomainOverviewRequestSchema>;

export const DomainOverviewQuoteSchema = z.object({
  /** The analyzed host, e.g. `example.com`. */
  domain: z.string(),
  /** Upper bound in USD for the parts that are not cached; 0 when everything is. */
  estimatedCostUsd: z.number(),
  cached: z.boolean(),
});
export type DomainOverviewQuote = z.infer<typeof DomainOverviewQuoteSchema>;

export const PositionBucketSchema = z.object({
  from: z.int(),
  to: z.int(),
  keywords: z.int(),
});

/** Organic ranking metrics of a domain in a market (DataForSEO Labs). */
export const DomainMetricsSchema = z.object({
  /** Keywords the domain ranks for in the top 100. */
  keywords: z.int(),
  /** Estimated monthly organic visits from those keywords. */
  traffic: z.number(),
  /** What that traffic would cost as ads, in USD per month. */
  trafficCostUsd: z.number(),
  /** Keywords by the position of the domain's best result, best first. */
  positions: z.array(PositionBucketSchema),
  newKeywords: z.int(),
  upKeywords: z.int(),
  downKeywords: z.int(),
  lostKeywords: z.int(),
});
export type DomainMetrics = z.infer<typeof DomainMetricsSchema>;

export const DomainHistoryPointSchema = z.object({
  /** First day of the month (YYYY-MM-01). */
  month: z.iso.date(),
  keywords: z.int(),
  traffic: z.number(),
  /** Keywords in positions 1–10. */
  top10: z.int(),
});

export const DomainKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.int().nullable(),
  cpc: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  intent: SearchIntentSchema.nullable(),
  position: z.int(),
  /** Places gained since the previous update (negative when lost); `null` when unknown. */
  change: z.int().nullable(),
  isNew: z.boolean(),
  url: z.string().nullable(),
  traffic: z.number().nullable(),
});
export type DomainKeyword = z.infer<typeof DomainKeywordSchema>;

export const DomainCompetitorSchema = z.object({
  domain: z.string(),
  commonKeywords: z.int(),
  avgPosition: z.number().nullable(),
  keywords: z.int().nullable(),
  traffic: z.number().nullable(),
});
export type DomainCompetitor = z.infer<typeof DomainCompetitorSchema>;

/** A backlink profile (DataForSEO Backlinks API, rank on the 0–100 scale). */
export const BacklinkProfileSchema = z.object({
  rank: z.number().nullable(),
  backlinks: z.int(),
  referringDomains: z.int(),
  referringDomainsNofollow: z.int(),
  referringMainDomains: z.int(),
  referringIps: z.int(),
  brokenBacklinks: z.int(),
  /** Average spam score of the backlinks, 0–100. */
  spamScore: z.number().nullable(),
  firstSeen: z.iso.datetime().nullable(),
});
export type BacklinkProfile = z.infer<typeof BacklinkProfileSchema>;

/** Where one part of a response came from. */
export const DataSourceStateSchema = z.object({
  fetchedAt: z.iso.datetime(),
  cached: z.boolean(),
});

export const DomainOverviewSchema = z.object({
  domain: z.string(),
  locationCode: z.int(),
  languageCode: z.string(),
  /** `null` when DataForSEO Labs has no ranking data for the domain in the market. */
  organic: DomainMetricsSchema.nullable(),
  /** Monthly organic history, oldest first. */
  history: z.array(DomainHistoryPointSchema),
  /** Keywords with the most estimated traffic. */
  topKeywords: z.array(DomainKeywordSchema),
  competitors: z.array(DomainCompetitorSchema),
  /** `null` when the Backlinks API knows no links to the domain. */
  backlinks: BacklinkProfileSchema.nullable(),
  sources: z.object({ labs: DataSourceStateSchema, backlinks: DataSourceStateSchema }),
  /** What this request cost; 0 when everything came from the cache. */
  costUsd: z.number(),
});
export type DomainOverview = z.infer<typeof DomainOverviewSchema>;
